import { requestUrl, RequestUrlResponse } from 'obsidian';
import { PaperInfo } from '../types';
import { isRateLimitError, SearchRateLimitError } from './requestGuards';
import { IEEEQuery, ieeeArticleUrl, parseIEEEQuery } from './ieeeQuery';
import { CrossrefWork, fromCrossrefWork, fromIEEEArticle, IEEEArticle, parseIEEEPage } from './ieeeMetadata';

export { isIEEEQuery } from './ieeeQuery';

const ARTICLE_LOOKUP_HELP = '无法读取这篇 IEEE 文献的公开元数据。请改用 DOI、论文标题，或在设置中填写 IEEE API key 后重试。';

interface IEEEResponse {
  articles?: IEEEArticle[];
  total_records?: number;
  totalfound?: number;
  error?: unknown;
  errors?: unknown;
}

interface CrossrefResponse {
  status?: string;
  message?: CrossrefWork | { items?: CrossrefWork[] };
}

/** Search public IEEE metadata through Crossref unless an IEEE API key is supplied. */
export async function searchIEEE(query: string, apiKey = ''): Promise<PaperInfo[]> {
  if (!query.trim()) return [];
  const parsed = parseIEEEQuery(query);
  if (parsed.kind === 'unsupported') {
    throw new Error('无法识别 IEEE 文献链接，请使用 document 链接、DOI、ieee:文献编号或论文标题。');
  }
  if (apiKey.trim()) return searchIEEEMetadata(parsed, apiKey.trim());
  if (parsed.kind === 'article') return searchIEEEPage(parsed.value);
  return searchCrossref(parsed);
}

async function searchIEEEMetadata(query: IEEEQuery, apiKey: string): Promise<PaperInfo[]> {
  const params = new URLSearchParams({ apikey: apiKey, format: 'json', max_records: '10' });
  params.set(query.kind === 'article' ? 'article_number' : query.kind === 'doi' ? 'doi' : 'querytext', query.value);
  const response = await requestMetadata(`https://ieeexploreapi.ieee.org/api/v1/search/articles?${params}`, 'IEEE API');
  const data = readJson<IEEEResponse>(response, 'IEEE API');
  if (data.error || data.errors) throw new Error('IEEE API 返回错误，请检查 API key 或稍后重试。');
  if (!Array.isArray(data.articles)) {
    if (data.total_records === 0 || data.totalfound === 0) return [];
    throw new Error('IEEE API 返回的文献信息格式无效，请稍后重试。');
  }
  return data.articles
    .filter(article => query.kind !== 'doi' || article.doi?.toLowerCase() === query.value.toLowerCase())
    .filter(article => query.kind !== 'article' || String(article.article_number) === query.value)
    .map(fromIEEEArticle)
    .filter(paper => !!paper.title);
}

async function searchCrossref(query: IEEEQuery): Promise<PaperInfo[]> {
  const exact = query.kind === 'doi';
  const params = new URLSearchParams({ 'query.bibliographic': query.value, filter: 'prefix:10.1109', rows: '10' });
  const url = exact ? `https://api.crossref.org/works/${encodeURIComponent(query.value)}`
    : `https://api.crossref.org/works?${params}`;
  const response = await requestMetadata(url, 'Crossref', exact);
  if (response.status === 404) return [];
  const data = readJson<CrossrefResponse>(response, 'Crossref');
  if (data.status !== 'ok' || !data.message || typeof data.message !== 'object') {
    throw new Error('Crossref 返回的文献信息格式无效，请稍后重试。');
  }
  let works: CrossrefWork[];
  if (exact) {
    const work = data.message as CrossrefWork;
    if (work.DOI?.toLowerCase() !== query.value.toLowerCase()) {
      throw new Error('Crossref 返回的 DOI 与查询不一致，请检查 DOI 后重试。');
    }
    works = [work];
  } else {
    const items = (data.message as { items?: CrossrefWork[] }).items;
    if (!Array.isArray(items)) throw new Error('Crossref 返回的文献列表格式无效，请稍后重试。');
    works = items;
  }
  return works.filter(work => /^10\.1109\//i.test(work.DOI ?? '')).map(fromCrossrefWork).filter(paper => !!paper.title);
}

async function searchIEEEPage(articleNumber: string): Promise<PaperInfo[]> {
  let page: Partial<PaperInfo>;
  try {
    const response = await requestMetadata(ieeeArticleUrl(articleNumber), 'IEEE Xplore');
    page = parseIEEEPage(response.text, articleNumber);
  } catch (error) {
    if (isRateLimitError(error)) throw error;
    throw new Error(ARTICLE_LOOKUP_HELP);
  }
  if (page.doi) {
    // A DOI found on this exact article page is safe to resolve; a title search is not.
    const papers = await searchCrossref({ kind: 'doi', value: page.doi });
    if (papers.length) {
      return papers.map(paper => ({
        ...paper,
        abstract: paper.abstract || page.abstract,
        institutions: paper.institutions?.length ? paper.institutions : page.institutions,
        url: ieeeArticleUrl(articleNumber),
      }));
    }
  }
  if (page.title) return [{ ...page, title: page.title, authors: page.authors ?? [], source: 'ieee' }];
  throw new Error(ARTICLE_LOOKUP_HELP);
}

async function requestMetadata(url: string, service: string, allowNotFound = false): Promise<RequestUrlResponse> {
  let response: RequestUrlResponse;
  try {
    response = await requestUrl({ url, method: 'GET', throw: false });
  } catch (error) {
    if (isRateLimitError(error)) throw new SearchRateLimitError(service);
    // Do not include an error's request URL: it may contain the private API key.
    throw new Error(`${service} 请求失败，请检查网络连接后重试。`);
  }
  if (response.status === 429) throw new SearchRateLimitError(service);
  if (allowNotFound && response.status === 404) return response;
  if (service === 'IEEE API' && (response.status === 401 || response.status === 403)) {
    throw new Error('IEEE API 授权失败，请检查设置中的 IEEE API key。');
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${service} 请求失败（HTTP ${response.status}），请稍后重试。`);
  }
  return response;
}

function readJson<T>(response: RequestUrlResponse, service: string): T {
  try {
    const data: unknown = response.json;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid response');
    return data as T;
  } catch {
    throw new Error(`${service} 返回了无效响应，请稍后重试。`);
  }
}
