export interface ReadingAsset {
  id: string;
  path: string;
  captionSource: string;
  captionChinese: string;
  page: number;
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
        captionSource: { type: 'string' }, captionChinese: { type: 'string' }, page: { type: 'integer' } },
      required: ['id', 'path', 'captionSource', 'captionChinese', 'page'],
    } },
  }, required: ['complete', 'markdown', 'assets', 'sourceInventory', 'missing'],
};

export function parseReadingResult(text: string): ReadingResult {
  const result = JSON.parse(text) as ReadingResult;
  if (!result || typeof result.complete !== 'boolean' || typeof result.markdown !== 'string' ||
    !Array.isArray(result.assets) || !Array.isArray(result.sourceInventory) || !Array.isArray(result.missing) ||
    result.sourceInventory.some(x => typeof x !== 'string') || result.missing.some(x => typeof x !== 'string') ||
    result.assets.some(a => !a || typeof a.id !== 'string' || typeof a.path !== 'string' ||
      typeof a.captionSource !== 'string' || typeof a.captionChinese !== 'string' || !Number.isInteger(a.page))) {
    throw new Error('论文阅读结果格式无效，未写入笔记');
  }
  if (!result.complete || result.missing.length) throw new Error(`论文阅读未完成：${result.missing.join('；') || '必需材料不足'}`);
  return result;
}
