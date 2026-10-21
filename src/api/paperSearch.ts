import { PaperInfo } from '../types';
import { isArxivQuery, searchArxiv } from './arxivSearch';
import { isIEEEQuery, searchIEEE } from './ieeeSearch';

export type PaperSearchSource = 'arxiv' | 'ieee' | 'all';

interface SearchFailure {
  source: string;
  error: unknown;
}

export function getPaperSearchSource(query: string, source: PaperSearchSource): PaperSearchSource {
  if (isIEEEQuery(query)) return 'ieee';
  if (isArxivQuery(query)) return 'arxiv';
  return source;
}

export async function searchPapers(
  query: string,
  source: PaperSearchSource,
  ieeeApiKey: string
): Promise<{ papers: PaperInfo[]; failures: SearchFailure[] }> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return { papers: [], failures: [] };

  // 精确的文献标识符只查询对应来源。
  const effectiveSource = getPaperSearchSource(normalizedQuery, source);
  const searches: Array<{ source: string; run: () => Promise<PaperInfo[]> }> = [];
  if (effectiveSource !== 'ieee') {
    searches.push({ source: 'arXiv', run: () => searchArxiv(normalizedQuery) });
  }
  if (effectiveSource !== 'arxiv') {
    searches.push({ source: 'IEEE', run: () => searchIEEE(normalizedQuery, ieeeApiKey) });
  }

  const settled = await Promise.allSettled(searches.map(search => search.run()));
  const papers: PaperInfo[] = [];
  const failures: SearchFailure[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') papers.push(...result.value);
    else failures.push({ source: searches[index]!.source, error: result.reason });
  });
  return { papers, failures };
}
