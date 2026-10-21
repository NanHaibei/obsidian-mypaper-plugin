import { PaperInfo } from '../types';

export function getPaperUrl(paper: PaperInfo): string | undefined {
  if (paper.url) {
    try {
      const url = new URL(paper.url);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch {
      // 元数据链接无效时仍可使用 DOI。
    }
  }
  return paper.doi ? `https://doi.org/${encodeURIComponent(paper.doi)}` : undefined;
}
