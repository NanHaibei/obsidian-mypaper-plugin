import { captionMatchesSource, normalizedFigureId } from './captionEvidence';
import type { ReadingResult } from './result';
import type { PaperSource } from './context';

export function noteHash(content: string): string {
  return require('crypto').createHash('sha256').update(content).digest('hex') as string;
}
const compact = (text: string) => text.normalize('NFKC').replace(/[-‐]\s*\n\s*/g, '').replace(/\s+/g, '');

export class ReadingValidationError extends Error {
  constructor(readonly issues: string[]) { super([...new Set(issues)].join('；')); this.name = 'ReadingValidationError'; }
}

export function collectReadingIssues(result: ReadingResult, source: PaperSource): string[] {
  const issues: string[] = [];
  if (!result.complete || result.missing.length) issues.push('论文必需部分未完成');
  const text = result.markdown.trim();
  if (!text || /AI\s*论文精读导师|<!--[\s\S]*?-->|cite/.test(text)) issues.push('结果含旧导师标题或内部标记');
  const chapters = ['问题背景', '现有工作的问题与论文动机', '论文方法', '实验结果', '方法缺陷与未来工作'];
  let position = -1;
  chapters.forEach((name, i) => {
    const pattern = new RegExp(`^#{2,3}\\s+${i + 1}[.、．]\\s*${name}\\s*✦\\s*$`, 'm');
    const match = pattern.exec(text);
    if (!match || match.index <= position) { issues.push(`缺少或乱序的章节：${i + 1}. ${name}`); return; }
    if (!i && text.slice(0, match.index).trim()) issues.push('正文须直接从“1. 问题背景”开始');
    position = match.index;
  });
  if (/!\[|<img\b/i.test(text)) issues.push('结果必须使用已核验的图表占位符，不得使用外链或未知图片');
  const assets = new Map(result.assets.map(a => [a.id, a]));
  if (assets.size !== result.assets.length) issues.push('图表 ID 重复');
  for (const asset of result.assets) {
    if (!/^(Figure|Table|Algorithm)\s+(?:(?:[A-Z]\.?)?\d+(?:\.\d+)*[a-z]?|[IVXLCDM]+)(?:\([a-z]\))?$/i.test(asset.id) ||
      !/^figures\/[A-Za-z0-9_.-]+\.png$/.test(asset.path) || asset.page < 1 || asset.page > source.pageCount) {
      issues.push('图表编号、路径或原文页码无效');
    }
    if (!asset.captionSource.trim() || !asset.captionChinese.trim() ||
      !captionMatchesSource(asset, source)) issues.push(`${asset.id} 原始图注无法在原文核对`);
    if (!/[\u3400-\u9fff]/.test(asset.captionChinese) || !/(?:\d|(?:图|表|算法|Figure|Table|Algorithm)\s*[IVXLCDM]+)/i.test(asset.captionChinese)) issues.push(`${asset.id} 缺少带编号的中文图注`);
    if (!text.includes(`{{asset:${asset.id}}}`)) issues.push(`${asset.id} 没有放在正文解释附近`);
  }
  const inventory = [...new Set([...source.captions, ...result.sourceInventory])];
  for (const id of inventory) {
    const normalized = normalizedFigureId(id);
    if (![...assets.keys()].map(normalizedFigureId).some(key => key === normalized || key.startsWith(normalized + '(') || key.slice(0, -1) === normalized && /[a-z]$/.test(key))) {
      issues.push(`原文图表未收录：${id}`);
    }
  }
  for (const token of text.matchAll(/\{\{asset:([^}]+)\}\}/g)) if (!assets.has(token[1]!)) issues.push(`未知图表：${token[1]}`);
  const visible = [text, ...result.assets.map(asset => asset.captionChinese)].join('\n\n');
  const math = [...visible.matchAll(/\$\$[\s\S]*?\$\$|\$(?!\$)(?:\\.|[^$\n])+\$/g)];
  for (const formula of math) if (/(^|[^\\])[_^](?!\{)/.test(formula[0])) issues.push('公式上下标必须使用花括号');
  const withoutMath = visible.replace(/\$\$[\s\S]*?\$\$|\$(?!\$)(?:\\.|[^$\n])+\$/g, 'FORMULA');
  if (/\\[([]|\\(?:frac|sum|begin)\b/.test(withoutMath)) issues.push('存在未放入数学环境的 LaTeX');
  for (const heading of text.matchAll(/^#{1,6}\s+.*$/gm)) if (!heading[0].trim().endsWith('✦')) issues.push('AI 标题缺少 ✦ 标记');
  const blocks = text.split(/\n\s*\n/);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!.trim();
    if (!block || /^\$\$[\s\S]*\$\$$/.test(block) || /^\{\{asset:[^}]+\}\}$/.test(block) || block === '✦') continue;
    if (/^\|/.test(block)) {
      if (blocks[i + 1]?.trim() !== '✦') issues.push('AI 整理的简单表格下方缺少独立 ✦');
      continue;
    }
    if (/^>\s/.test(block) && compact(source.text).includes(compact(block.replace(/^>\s?/gm, '')))) continue;
    if (!block.endsWith('✦')) issues.push('AI 正文块缺少末尾 ✦ 标记');
    for (const item of block.matchAll(/^\s*(?:[-*+] |\d+[.)] ).*$/gm)) {
      if (!item[0].trim().endsWith('✦')) issues.push('AI 列表项缺少末尾 ✦ 标记');
    }
  }
  return [...new Set(issues)];
}

export function validateReadingNote(result: ReadingResult, source: PaperSource): void {
  const issues = collectReadingIssues(result, source);
  if (issues.length) throw new ReadingValidationError(issues);
}

export function renderReadingNote(result: ReadingResult, paths: Map<string, string>): string {
  return result.markdown.trim().replace(/\{\{asset:([^}]+)\}\}/g, (_all, id: string) => {
    const asset = result.assets.find(a => a.id === id);
    const path = paths.get(id);
    if (!asset || !path) throw new Error(`图表未成功保存：${id}`);
    return `![[${path}]]\n\n${asset.captionChinese.replace(/✦\s*$/, '').trim()}✦`;
  });
}

export function appendReadingNote(content: string, generated: string, expectedHash?: string): string {
  if (content.includes(generated.trim())) return content;
  if (expectedHash && noteHash(content) !== expectedHash) throw new Error('写入前笔记已变化，结果已缓存，请检查后重试');
  // Remove only an empty, trailing placeholder. Never touch existing human paragraphs.
  const before = content.replace(/\n##\s+笔记\s*\n\s*$/, '\n');
  return `${before.trimEnd()}\n\n${generated.trim()}\n`;
}
