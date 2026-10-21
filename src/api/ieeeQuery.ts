export type IEEEQuery = { kind: 'doi' | 'article' | 'text' | 'unsupported'; value: string };

/** Bare integers are treated as IEEE article numbers, not keyword searches. */
export function isIEEEQuery(query: string): boolean {
  return parseIEEEQuery(query).kind !== 'text';
}

export function parseIEEEQuery(query: string): IEEEQuery {
  const value = query.trim();
  const article = value.match(/^(?:ieee\s*[:：]\s*)?(\d+)$/i);
  if (article?.[1]) return { kind: 'article', value: article[1] };

  const doi = value.replace(/^doi\s*[:：]\s*/i, '');
  if (/^10\.1109\/\S+$/i.test(doi)) return { kind: 'doi', value: doi };

  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'text', value };
    if (/^(?:dx\.)?doi\.org$/i.test(url.hostname)) {
      const decoded = decodeURIComponent(url.pathname.slice(1));
      if (/^10\.1109\/\S+$/i.test(decoded)) return { kind: 'doi', value: decoded };
    }
    if (/^(?:www\.)?ieeexplore\.ieee\.org$/i.test(url.hostname)) {
      const documentId = url.pathname.match(/^\/(?:abstract\/)?document\/(\d+)(?:\/|$)/i)?.[1];
      const id = documentId || url.searchParams.get('arnumber');
      if (id && /^\d+$/.test(id)) return { kind: 'article', value: id };
      return { kind: 'unsupported', value };
    }
  } catch {
    // Ordinary titles and keywords are not URLs.
  }

  if (/^ieee\s*[:：]/i.test(value)) return { kind: 'unsupported', value };
  return { kind: 'text', value };
}

export function ieeeArticleUrl(articleNumber: string): string {
  return `https://ieeexplore.ieee.org/document/${articleNumber}`;
}

export function safePaperUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (/^(?:(?:www\.)?ieeexplore\.ieee\.org|(?:dx\.)?doi\.org)$/i.test(url.hostname) && url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch {
    // Ignore invalid publisher URLs; callers can use the DOI instead.
  }
  return undefined;
}
