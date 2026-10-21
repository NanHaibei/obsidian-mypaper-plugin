export interface ReadingAsset {
  id: string;
  path: string;
  captionSource: string;
  captionChinese: string;
  page: number;
  /** Older cached numbered assets imply present. Absent requires a page excerpt, never an invented caption. */
  captionStatus?: 'present' | 'absent';
  sourceExcerpt?: string;
}
export interface ReadingResult {
  complete: boolean;
  markdown: string;
  assets: ReadingAsset[];
  sourceInventory: string[];
  missing: string[];
  threadId?: string;
}
export const READING_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    complete: { type: 'boolean' }, markdown: { type: 'string' },
    sourceInventory: { type: 'array', items: { type: 'string' } },
    missing: { type: 'array', items: { type: 'string' } },
    assets: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: { id: { type: 'string' }, path: { type: 'string' },
        captionSource: { type: 'string' }, captionChinese: { type: 'string' }, page: { type: 'integer' },
        captionStatus: { type: 'string', enum: ['present', 'absent'] }, sourceExcerpt: { type: 'string' } },
      required: ['id', 'path', 'captionSource', 'captionChinese', 'page', 'captionStatus', 'sourceExcerpt'],
    } },
  }, required: ['complete', 'markdown', 'assets', 'sourceInventory', 'missing'],
};

export function parseReadingResult(text: string): ReadingResult {
  const result = JSON.parse(text) as ReadingResult;
  if (!result || typeof result.complete !== 'boolean' || typeof result.markdown !== 'string' ||
    !Array.isArray(result.assets) || !Array.isArray(result.sourceInventory) || !Array.isArray(result.missing) ||
    result.sourceInventory.some(x => typeof x !== 'string') || result.missing.some(x => typeof x !== 'string') ||
    result.assets.some(a => !a || typeof a.id !== 'string' || typeof a.path !== 'string' ||
      typeof a.captionSource !== 'string' || typeof a.captionChinese !== 'string' || !Number.isInteger(a.page) ||
      a.captionStatus !== undefined && !['present', 'absent'].includes(a.captionStatus) ||
      a.sourceExcerpt !== undefined && typeof a.sourceExcerpt !== 'string')) {
    throw new Error('论文阅读结果格式无效，未写入笔记');
  }
  // Incomplete, structurally valid drafts must reach the service so their latest work is preserved.
  // Completion is enforced by collectReadingIssues before any note is written.
  return result;
}
