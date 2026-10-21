import { PaperInfo } from '../types';
import { ieeeArticleUrl, parseIEEEQuery, safePaperUrl } from './ieeeQuery';

export interface IEEEArticle {
  title?: string;
  publication_title?: string;
  publication_date?: string;
  publication_year?: string | number;
  article_number?: string | number;
  abstract_url?: string;
  doi?: string;
  abstract?: string;
  authors?: { authors?: Array<{ full_name?: string; affiliation?: string }> };
}

type CrossrefDate = { 'date-parts'?: number[][] };

export interface CrossrefWork {
  DOI?: string;
  title?: string[];
  'container-title'?: string[];
  author?: Array<{ given?: string; family?: string; name?: string; affiliation?: Array<{ name?: string }> }>;
  published?: CrossrefDate;
  'published-online'?: CrossrefDate;
  'published-print'?: CrossrefDate;
  issued?: CrossrefDate;
  abstract?: string;
  URL?: string;
  resource?: { primary?: { URL?: string } };
}

export function plainMetadataText(value: string | undefined): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return (value ?? '')
    .replace(/<\/?(?:jats:)?(?:p|div|br|sec|section|title|li)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
      if (entity.startsWith('#')) {
        const hex = entity[1]?.toLowerCase() === 'x';
        const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return entities[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function fromIEEEArticle(article: IEEEArticle): PaperInfo {
  const authors = article.authors?.authors ?? [];
  const articleNumber = String(article.article_number ?? '');
  const doi = article.doi?.trim();
  return {
    title: plainMetadataText(article.title),
    journal: plainMetadataText(article.publication_title),
    date: article.publication_date || String(article.publication_year ?? ''),
    authors: authors.map(author => plainMetadataText(author.full_name)).filter(Boolean),
    institutions: [...new Set(authors.map(author => plainMetadataText(author.affiliation)).filter(Boolean))],
    doi,
    abstract: plainMetadataText(article.abstract),
    url: /^\d+$/.test(articleNumber) ? ieeeArticleUrl(articleNumber)
      : safePaperUrl(article.abstract_url) || (doi ? `https://doi.org/${doi}` : undefined),
    source: 'ieee',
  };
}

export function fromCrossrefWork(work: CrossrefWork): PaperInfo {
  const parts = (work.published ?? work['published-online'] ?? work['published-print'] ?? work.issued)?.['date-parts']?.[0] ?? [];
  const authors = work.author ?? [];
  const doi = work.DOI?.trim();
  return {
    title: plainMetadataText(work.title?.[0]),
    journal: plainMetadataText(work['container-title']?.[0]),
    date: parts.slice(0, 3).map((part, index) => index === 0 ? String(part) : `0${part}`.slice(-2)).join('-'),
    authors: authors.map(author => plainMetadataText(author.name || [author.given, author.family].filter(Boolean).join(' '))).filter(Boolean),
    institutions: [...new Set(authors.reduce<string[]>((names, author) => {
      return names.concat((author.affiliation ?? []).map(item => plainMetadataText(item.name)).filter(Boolean));
    }, []))],
    doi,
    abstract: plainMetadataText(work.abstract),
    url: safePaperUrl(work.resource?.primary?.URL) || safePaperUrl(work.URL) || (doi ? `https://doi.org/${doi}` : undefined),
    source: 'ieee',
  };
}

/** Read only citation metadata; page headings may belong to a login/challenge page. */
export function parseIEEEPage(html: string, articleNumber: string): Partial<PaperInfo> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const values = (name: string): string[] => Array.from(doc.querySelectorAll(`meta[name="${name}"]`))
    .map(meta => plainMetadataText(meta.getAttribute('content') ?? '')).filter(Boolean);
  const first = (name: string): string => values(name)[0] ?? '';
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || first('citation_abstract_html_url');
  if (canonical) {
    const identity = parseIEEEQuery(canonical);
    if (identity.kind === 'article' && identity.value !== articleNumber) return {};
  }
  const doiQuery = parseIEEEQuery(first('citation_doi'));
  return {
    title: first('citation_title'),
    authors: values('citation_author'),
    institutions: [...new Set(values('citation_author_institution'))],
    journal: first('citation_journal_title') || first('citation_conference_title'),
    date: first('citation_publication_date') || first('citation_date') || first('citation_online_date'),
    doi: doiQuery.kind === 'doi' ? doiQuery.value : undefined,
    abstract: first('citation_abstract') || first('description'),
    url: ieeeArticleUrl(articleNumber),
    source: 'ieee',
  };
}
