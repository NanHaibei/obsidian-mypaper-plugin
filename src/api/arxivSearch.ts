import { requestUrl } from 'obsidian';
import { PaperInfo } from '../types';
import {
  isRateLimitError,
  runWithMinimumInterval,
  SearchRateLimitError,
  wait,
} from './requestGuards';

const ARXIV_MIN_REQUEST_INTERVAL_MS = 3200;
const ARXIV_RETRY_DELAY_MS = 5000;
const ARXIV_CACHE_TTL_MS = 10 * 60 * 1000;
let lastArxivRequestAt = 0;
let arxivQueue: Promise<unknown> = Promise.resolve();

const arxivCache = new Map<string, { createdAt: number; results: PaperInfo[] }>();
const arxivInFlight = new Map<string, Promise<PaperInfo[]>>();

/**
 * 检测输入是否为 arXiv ID
 * 支持格式：1706.03762, arXiv:1706.03762, arxiv:1706.03762
 * 也支持旧格式：math.GT/0309136
 */
function isArxivId(input: string): { isId: boolean; id: string } {
  const trimmed = input.trim();
  
  // 支持 arXiv:2507.08656、arXiv：2507.08656、arxiv.org/abs/2507.08656、
  // doi.org/10.48550/arXiv.2507.08656 等常见复制格式。
  const arxivIdMatch = trimmed.match(
    /(?:arxiv\s*[:：]\s*|arxiv\.\s*|arxiv\.org\/(?:abs|pdf)\/|10\.48550\/arxiv\.|^)([a-z-]+(?:\.[A-Z]{1,2})?\/\d{7}|\d{4}\.\d{4,5}(?:v\d+)?)/i
  );
  const withoutPrefix = arxivIdMatch?.[1] ?? trimmed;
  
  // 检查新格式：YYMM.NNNNN 或 YYMM.NNNNNvN（版本）
  const newFormat = /^\d{4}\.\d{4,5}(v\d+)?$/.test(withoutPrefix);
  
  // 检查旧格式：category/NNNNNNN
  const oldFormat = /^[a-z-]+(\.[A-Z]{1,2})?\/\d{7}$/.test(withoutPrefix);
  
  if (newFormat || oldFormat) {
    return { isId: true, id: withoutPrefix };
  }
  
  return { isId: false, id: '' };
}

export function isArxivQuery(query: string): boolean {
  return isArxivId(query).isId;
}

export async function searchArxiv(query: string): Promise<PaperInfo[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const cacheKey = normalizedQuery.toLowerCase();
  const cached = arxivCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < ARXIV_CACHE_TTL_MS) {
    return cached.results;
  }

  const pending = arxivInFlight.get(cacheKey);
  if (pending) return pending;

  const queuedSearch = arxivQueue
    .then(() => searchArxivUncached(normalizedQuery))
    .then(results => {
      arxivCache.set(cacheKey, { createdAt: Date.now(), results });
      return results;
    })
    .finally(() => {
      arxivInFlight.delete(cacheKey);
    });

  arxivInFlight.set(cacheKey, queuedSearch);
  arxivQueue = queuedSearch.catch(() => undefined);
  return queuedSearch;
}

async function searchArxivUncached(query: string): Promise<PaperInfo[]> {
  const { isId, id } = isArxivId(query);

  if (isId) {
    const fallback = await fetchArxivAbsPage(id);
    if (fallback) return [fallback];

    try {
      const response = await requestArxiv(buildArxivUrl({ idList: id }));
      const results = parseArxivResponse(response.text);
      if (results.length > 0) return results;
    } catch (error) {
      if (!isRateLimitError(error)) throw error;
    }
    return [];
  }

  const urls = buildSearchUrls(query);

  for (const url of urls) {
    const response = await requestArxiv(url);
    const results = parseArxivResponse(response.text);
    if (results.length > 0) return results;
  }

  return [];
}

async function fetchArxivAbsPage(id: string): Promise<PaperInfo | null> {
  const cleanId = id.replace(/v\d+$/i, '');
  const response = await requestUrl({
    url: `https://arxiv.org/abs/${encodeURIComponent(cleanId)}`,
    method: 'GET',
  });
  if (response.status === 429) {
    throw new SearchRateLimitError('arXiv');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(response.text, 'text/html');
  const title = getMetaContent(doc, 'citation_title')
    || doc.querySelector('h1.title')?.textContent?.replace(/^Title:\s*/i, '').trim()
    || '';
  if (!title) return null;

  const authors = Array.from(doc.querySelectorAll('meta[name="citation_author"]'))
    .map(meta => meta.getAttribute('content')?.trim() ?? '')
    .filter(Boolean);
  const date = getMetaContent(doc, 'citation_date')
    || getMetaContent(doc, 'citation_online_date')
    || '';
  const abstract =
    doc.querySelector('blockquote.abstract')?.textContent
      ?.replace(/^Abstract:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim() ?? '';

  return {
    title: title.replace(/\s+/g, ' ').trim(),
    journal: 'arXiv',
    date,
    authors,
    institutions: [],
    arxivId: cleanId,
    abstract,
    url: `https://arxiv.org/abs/${cleanId}`,
    source: 'arxiv' as const,
  };
}

function getMetaContent(doc: Document, name: string): string {
  return doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() ?? '';
}

function buildArxivUrl(options: { searchQuery?: string; idList?: string }): string {
  const params = new URLSearchParams({
    start: '0',
    max_results: '10',
  });
  if (options.idList) {
    params.set('id_list', options.idList);
  }
  if (options.searchQuery) {
    params.set('search_query', options.searchQuery);
    params.set('sortBy', 'relevance');
    params.set('sortOrder', 'descending');
  }

  return `https://export.arxiv.org/api/query?${params.toString()}`;
}

function buildSearchUrls(query: string): string[] {
  const normalized = normalizeSearchText(query);
  const phrase = escapeArxivPhrase(normalized);
  const keywords = extractSearchKeywords(normalized);
  const searchQueries = [
    `ti:"${phrase}"`,
    `all:"${phrase}"`,
    keywords.length > 0 ? keywords.map(word => `all:${word}`).join(' AND ') : '',
    `all:${normalized}`,
  ].filter(Boolean);

  return Array.from(new Set(searchQueries)).map(searchQuery =>
    buildArxivUrl({ searchQuery })
  );
}

function normalizeSearchText(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function escapeArxivPhrase(query: string): string {
  return query.replace(/["\\]/g, ' ');
}

function extractSearchKeywords(query: string): string[] {
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'by',
    'for',
    'from',
    'in',
    'into',
    'is',
    'of',
    'on',
    'or',
    'the',
    'to',
    'via',
    'with',
  ]);

  const seen = new Set<string>();
  return query
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .filter(word => {
      if (seen.has(word)) return false;
      seen.add(word);
      return true;
    })
    .slice(0, 8);
}

async function requestArxiv(url: string): Promise<{ text: string }> {
  return runWithMinimumInterval(
    async () => {
      try {
        const firstResponse = await requestUrl({ url, method: 'GET' });
        if (firstResponse.status === 429) {
          throw new SearchRateLimitError('arXiv');
        }
        return firstResponse;
      } catch (error) {
        if (!isRateLimitError(error)) throw error;
        await wait(ARXIV_RETRY_DELAY_MS);
        const retryResponse = await requestUrl({ url, method: 'GET' });
        if (retryResponse.status === 429) {
          throw new SearchRateLimitError('arXiv');
        }
        return retryResponse;
      }
    },
    () => lastArxivRequestAt,
    value => {
      lastArxivRequestAt = value;
    },
    ARXIV_MIN_REQUEST_INTERVAL_MS
  );
}

function parseArxivResponse(xml: string): PaperInfo[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  return Array.from(doc.querySelectorAll('entry')).map(entry => {
    const title =
      entry.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const published = entry.querySelector('published')?.textContent?.trim() ?? '';
    const date = published.substring(0, 10);

    const authors = Array.from(entry.querySelectorAll('author name')).map(
      n => n.textContent?.trim() ?? ''
    );
    const institutions = Array.from(
      entry.getElementsByTagNameNS('http://arxiv.org/schemas/atom', 'affiliation')
    ).map(n => n.textContent?.trim() ?? '');

    const journalRefEl = entry.getElementsByTagNameNS(
      'http://arxiv.org/schemas/atom',
      'journal_ref'
    )[0];
    const journal = journalRefEl?.textContent?.trim() || 'arXiv';
    const idUrl = entry.querySelector('id')?.textContent?.trim() ?? '';
    const arxivId = idUrl.split('/abs/').pop() ?? idUrl;
    const abstract =
      entry.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    return {
      title,
      journal,
      date,
      authors,
      institutions,
      arxivId,
      abstract,
      url: idUrl,
      source: 'arxiv' as const,
    };
  });
}
