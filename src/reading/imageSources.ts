import type { PaperInfo } from '../types';
import { getPaperUrl } from '../utils/paperLinks';

export interface ImageCandidate { url: string; label: string; score: number }

export function publicPaperUrl(value: string, base?: string): string {
  const url = new URL(value, base);
  const host = url.hostname.toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') ||
      /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) || host.includes(':')) {
    throw new Error('论文图片只允许来自公开 HTTP/HTTPS 网址');
  }
  return url.href;
}

export function paperPages(paper: PaperInfo): { html: string[]; pdf: string[] } {
  const url = getPaperUrl(paper);
  const id = (paper.arxivId || url?.match(/arxiv\.org\/(?:abs|html|pdf)\/(.+)/)?.[1] || '')
    .replace(/^https?:\/\/[^/]+\/(?:abs|html|pdf)\//, '').replace(/\.pdf$/, '').trim();
  const html: string[] = [], pdf: string[] = [];
  if (id && /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-zA-Z]+)?\/\d{7})(?:v\d+)?$/.test(id)) {
    html.push(`https://arxiv.org/html/${id}`);
    pdf.push(`https://arxiv.org/pdf/${id}`);
  }
  if (url) {
    if (/\.pdf(?:$|[?#])|arxiv\.org\/pdf\//i.test(url)) pdf.push(publicPaperUrl(url));
    else html.push(publicPaperUrl(url));
  }
  return { html: [...new Set(html)], pdf: [...new Set(pdf)] };
}

export function imageCandidates(doc: Document, pageUrl: string): ImageCandidate[] {
  // arXiv 页面可能从无版本号地址跳转到 v1，读取页面自己的 canonical 地址。
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  const baseTag = doc.querySelector<HTMLBaseElement>('base[href]')?.getAttribute('href');
  let base = pageUrl;
  for (const candidate of [canonical, baseTag]) {
    if (!candidate) continue;
    try {
      const resolved = publicPaperUrl(candidate, pageUrl);
      if (new URL(resolved).origin === new URL(pageUrl).origin) base = resolved;
    } catch { /* 忽略无效 base。 */ }
  }
  // 论文 HTML 地址是目录，即使未带末尾斜杠，其图片相对地址也在该目录内。
  if (/arxiv\.org\/html\//.test(base)) base = base.replace(/\/$/, '') + '/';
  const result: ImageCandidate[] = [];
  doc.querySelectorAll('figure').forEach((figure, index) => {
    const caption = figure.querySelector('figcaption')?.textContent || '';
    const number = caption.match(/(?:Figure|Fig\.?|图)\s*(\d+)/i)?.[1];
    const label = number ? `图 ${number}（论文原图）` : `论文原图 ${index + 1}`;
    const score = /overview|framework|pipeline|architecture|架构|框架/i.test(caption) ? 100 - index : 50 - index;
    figure.querySelectorAll<HTMLImageElement>('img').forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (!src) return;
      // arXiv 也会输出 "2609.11553v1/figure.png"，它相对 /html/ 而非论文目录。
      const imageBase = /arxiv\.org\/html\//.test(base) && /^\d{4}\.\d{4,5}v\d+\//.test(src)
        ? new URL('/html/', base).href : base;
      try { result.push({ url: publicPaperUrl(src, imageBase), label, score }); }
      catch { /* 跳过 data URL 和非公开地址。 */ }
    });
  });
  return result.sort((a, b) => b.score - a.score).filter((item, i, all) => all.findIndex(other => other.url === item.url) === i);
}

export function rasterExtension(buffer: ArrayBuffer): string | undefined {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12) return undefined;
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (String.fromCharCode(...bytes.slice(0, 6)).startsWith('GIF8')) return 'gif';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp';
  return undefined;
}
