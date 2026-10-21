import { captionMatchesSource } from './captionEvidence';
import type { ReadingAsset } from './result';
import type { PaperSource } from './context';

/** A locator for original unnumbered material, never a number attributed to the paper. */
export function unnumberedLocator(id: string): { kind: string; page: number } | undefined {
  const match = /^(Figure|Table|Algorithm) \(unnumbered, page ([1-9]\d*)(?:, item [1-9]\d*)?\)$/.exec(id);
  return match ? { kind: match[1]!, page: Number(match[2]) } : undefined;
}

export function assetProvenanceIssues(asset: ReadingAsset, source: PaperSource): string[] {
  const issues: string[] = [];
  const locator = unnumberedLocator(asset.id);
  if (locator && locator.page !== asset.page) issues.push(`${asset.id} 定位页码与 PDF 页码不一致`);
  if (asset.captionStatus === 'absent') {
    if (!locator || asset.captionSource.trim()) issues.push(`${asset.id} 无图注资产必须使用未编号定位且不得填造原图注`);
    // A host-saved per-page text layer is required; a paper-wide match cannot prove the location.
    const excerpt = asset.sourceExcerpt?.trim() || '';
    if (!source.pageTexts || excerpt.replace(/\s/g, '').length < 12 || !captionMatchesSource({ ...asset, captionSource: excerpt }, source)) {
      issues.push(`${asset.id} 缺少可在对应 PDF 页核对的原文定位片段`);
    }
    if (!/原文无(?:独立)?(?:图注|表注|算法注|说明)/.test(asset.captionChinese) || !/AI\s*说明/.test(asset.captionChinese) ||
      !asset.captionChinese.includes(`第 ${asset.page} 页`)) {
      issues.push(`${asset.id} 说明须注明 PDF 页码、“原文无独立图注/表注”与“AI 说明”`);
    }
  } else if (!asset.captionSource.trim() || !captionMatchesSource(asset, source)) {
    issues.push(`${asset.id} 原始图注无法在原文核对`);
  }
  if (locator && (!asset.captionChinese.includes('未编号') || !asset.captionChinese.includes(`第 ${asset.page} 页`))) {
    issues.push(`${asset.id} 中文说明须明确原文未编号及 PDF 页码`);
  }
  if (!/[\u3400-\u9fff]/.test(asset.captionChinese) || !/(?:\d|(?:图|表|算法|Figure|Table|Algorithm)\s*[IVXLCDM]+)/i.test(asset.captionChinese)) {
    issues.push(`${asset.id} 缺少带编号或页面定位的中文图注/说明`);
  }
  return issues;
}
