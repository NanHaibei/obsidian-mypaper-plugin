import { writeBundledSkill } from './skillBundle';
import { FileSystemAdapter, loadPdfJs, requestUrl, type TFile, type Vault } from 'obsidian';
import type { PaperInfo } from '../types';
import { paperPages, publicPaperUrl } from './imageSources';

export interface PaperSource {
  url: string;
  text: string;
  pageCount: number;
  captions: string[];
  pageTexts?: string[];
}

function check(signal: AbortSignal): void { if (signal.aborted) throw new Error('任务已取消'); }

export async function checkCropRuntime(signal: AbortSignal): Promise<string> {
  const { execFile } = require('child_process') as typeof import('child_process');
  const path = require('path') as typeof import('path');
  const os = require('os') as typeof import('os');
  const candidates = [process.env.MYPAPER_PYTHON,
    path.join(os.homedir(), '.local', 'share', 'mypaper-reading-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    ...(process.platform === 'win32' && process.env.LOCALAPPDATA
      ? [path.join(process.env.LOCALAPPDATA, 'MyPaperManager', 'python', 'Scripts', 'python.exe')] : []),
    'python3', 'python', '/opt/homebrew/bin/python3', '/usr/local/bin/python3'];
  for (const executable of candidates.filter((value): value is string => !!value)) {
    check(signal);
    const available = await new Promise<boolean>(resolve => execFile(executable,
      ['-c', 'import sys; assert sys.version_info >= (3, 9); from PIL import Image'],
      { timeout: 10_000, windowsHide: true, signal }, error => resolve(!error)));
    if (available) return executable;
  }
  check(signal);
  throw new Error('未找到 Python 3.9+ 与 Pillow 裁图环境，尚未调用模型。请安装后重试。');
}

async function fetchSource(url: string, signal: AbortSignal): Promise<Awaited<ReturnType<typeof requestUrl>>> {
  check(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    const response = await Promise.race([requestUrl({ url: publicPaperUrl(url), throw: false }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('获取论文原文超时')), 45_000);
        abort = () => reject(new Error('任务已取消'));
        signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
      })]);
    check(signal);
    if (response.status >= 400) throw new Error(`原文来源返回 HTTP ${response.status}`);
    if (response.arrayBuffer.byteLength > 80 * 1024 * 1024) throw new Error('原文超过 80 MB，未自动处理');
    return response;
  } finally { if (timer) clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

export async function copySkill(target: string): Promise<void> {
  await writeBundledSkill(target);
}

/** Original PDF, full text, text coordinates and page pixels; no heuristic figure limits. */
export async function preparePaperSource(paper: PaperInfo, directory: string, signal: AbortSignal,
  progress: (text: string) => void): Promise<PaperSource> {
  const fs = require('fs/promises') as typeof import('fs/promises');
  const path = require('path') as typeof import('path');
  const candidates = paperPages(paper);
  let pdf: ArrayBuffer | undefined, sourceUrl = '';
  const failures: string[] = [];
  const tryPdf = async (url: string) => {
    try {
      const result = await fetchSource(url, signal);
      if (String.fromCharCode(...new Uint8Array(result.arrayBuffer).slice(0, 5)) !== '%PDF-') return;
      pdf = result.arrayBuffer; sourceUrl = url;
    } catch (error) { check(signal); failures.push(String(error)); }
  };
  for (const url of candidates.pdf) { await tryPdf(url); if (pdf) break; }
  if (!pdf) for (const url of candidates.html) {
    try {
      const result = await fetchSource(url, signal);
      if (String.fromCharCode(...new Uint8Array(result.arrayBuffer).slice(0, 5)) === '%PDF-') {
        pdf = result.arrayBuffer; sourceUrl = url; break;
      }
      const doc = new DOMParser().parseFromString(result.text, 'text/html');
      const link = doc.querySelector<HTMLMetaElement>('meta[name="citation_pdf_url"]')?.content;
      if (link) { await tryPdf(publicPaperUrl(link, url)); if (pdf) break; }
    } catch (error) { check(signal); failures.push(String(error)); }
  }
  if (!pdf) throw new Error(`无法取得可核查的论文全文 PDF，请补充公开 PDF 链接后重试。${failures.slice(-1).join('')}`);
  await fs.mkdir(path.join(directory, 'source-pages'), { recursive: true });
  await fs.writeFile(path.join(directory, 'source.pdf'), new Uint8Array(pdf));
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false });
  const abort = () => { void task.destroy(); }; signal.addEventListener('abort', abort, { once: true });
  const pages: { page: number; image: string; width: number; height: number; text: string; lines: object[] }[] = [];
  try {
    const document = await task.promise;
    for (let number = 1; number <= document.numPages; number++) {
      check(signal); progress(`准备原文 ${number}/${document.numPages} 页`);
      const page = await document.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2.5, 1700 / base.width) });
      const items = (await page.getTextContent()).items;
      const lines: { text: string; x: number; y: number; width: number; height: number }[] = [];
      for (const item of items) {
        if (!item.str?.trim()) continue;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        lines.push({ text: item.str, x, y, width: Math.abs(item.width * viewport.scale), height: Math.abs(item.height * viewport.scale) });
      }
      const text = items.map((item: { str?: string; hasEOL?: boolean }) => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join('');
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        const context = canvas.getContext('2d'); if (!context) throw new Error('无法准备 PDF 页面图像');
        await page.render({ canvasContext: context, viewport, intent: 'print', background: 'white' }).promise;
        check(signal);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('导出原文页面失败')), 'image/png'));
        const image = `source-pages/page-${String(number).padStart(3, '0')}.png`;
        await fs.writeFile(path.join(directory, image), new Uint8Array(await blob.arrayBuffer()));
        pages.push({ page: number, image, width: canvas.width, height: canvas.height, text, lines });
      } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
    }
  } finally { signal.removeEventListener('abort', abort); await task.destroy(); }
  const text = pages.map(p => p.text).join('\n\n');
  if (text.trim().length < 1000) throw new Error('PDF 可提取的文字不足，未将摘要或扫描图片误作完整原文');
  await fs.writeFile(path.join(directory, 'source-text.json'), JSON.stringify({ url: sourceUrl, pages }, null, 2));
  const captions = [...new Set([...text.matchAll(/(?:^|\n)\s*(Figure|Fig\.?|Table|Algorithm)\s+((?:[A-Z]\.?)?\d+(?:\.\d+)*|[IVXLCDM]+)\s*[:.]/gi)]
    .map(m => `${/^table$/i.test(m[1]!) ? 'Table' : /^algorithm$/i.test(m[1]!) ? 'Algorithm' : 'Figure'} ${m[2]}`))];
  return { url: sourceUrl, text, pageCount: pages.length, captions, pageTexts: pages.map(page => page.text) };
}

/** Candidates stay labelled as unverified; absence of ✦ never proves authorship. */
export async function collectStyleSamples(vault: Vault, file: TFile, workspace: string): Promise<object[]> {
  const folder = file.parent?.path || workspace;
  const files = vault.getMarkdownFiles().filter(f => f.path.startsWith(workspace + '/') &&
    !f.path.includes('/分类备份/') && !f.path.includes('/AI论文图片/'))
    .sort((a, b) => Number(b.parent?.path === folder) - Number(a.parent?.path === folder) || b.stat.mtime - a.stat.mtime);
  const samples: object[] = [];
  for (const candidate of files) {
    const content = await vault.cachedRead(candidate);
    const match = /^##\s+笔记\s*\n/m.exec(content) || /^##\s+1[.、．]\s*问题背景.*\n/m.exec(content);
    if (!match) continue;
    const body = content.slice(match.index + match[0].length).split(/^##\s+AI 论文精读导师\s*$/m)[0]!.trim();
    if (!body) continue;
    const excerpt = body.split(/\n\s*\n/).filter(block => !block.includes('✦')).join('\n\n').slice(0, 6000);
    if (excerpt) samples.push({ path: candidate.path, authorship: '来源未确认；不得仅凭没有 ✦ 认定人工内容', excerpt });
    if (samples.length === 5) break;
  }
  return samples;
}

export function vaultBase(vault: Vault): string {
  if (!(vault.adapter instanceof FileSystemAdapter)) throw new Error('论文 Skill 运行仅支持桌面端本地笔记库');
  return vault.adapter.getBasePath();
}
