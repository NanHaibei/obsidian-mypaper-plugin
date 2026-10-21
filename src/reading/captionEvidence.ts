import type { ReadingAsset, ReadingResult } from './result';
import type { PaperSource } from './context';

/** Layout differences are ignored; words, numbers and mathematical operators are retained. */
export function captionEvidence(text: string): string {
  return text.normalize('NFKC').replace(/\u00ad/g, '').replace(/[-‐]\s*\n\s*/g, '')
    .replace(/[−–‐‑]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/\\(?:mathrm|mathcal|mathbf|mathit|text)\b/g, '').replace(/\\(?:ldots|cdots)/g, '...')
    .replace(/\\times\b/g, '×').replace(/\\pm\b/g, '±').replace(/\\[{},;! ]/g, '')
    .replace(/[_^{}$]/g, '').replace(/\bFig\.(?=\s*\d)/g, 'Figure').replace(/\s+/g, '');
}

export function normalizedFigureId(id: string): string {
  return id.replace(/^(Figure|Table|Algorithm)\s+([IVXLCDM]+)(?=$|[a-z(])/i, (_all, kind: string, roman: string) => {
    const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    const digits = roman.toUpperCase().split('').map(char => values[char]!);
    const number = digits.reduce((sum, value, i) => sum + (value < (digits[i + 1] || 0) ? -value : value), 0);
    return `${kind} ${number}`;
  }).toLowerCase();
}

const GAP = '\uE000', WRAP = '\uE001', ICON = '\uE002';
const pictographs = /[★☆●○■□▲△◆◇⭐🔴🟢🔵]/gu;
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Only a hyphen at an actual PDF line break is optional; ordinary word hyphens stay significant. */
function matchesLayout(candidate: string, original: string): boolean {
  if (/[\uE000-\uE002]/.test(original)) return false;
  const evidence = captionEvidence(original.replace(/(?<=\p{L})[-‐][ \t]*\r?\n[ \t]*(?=\p{L})/gu, WRAP)
    .replace(/\s+/g, GAP));
  const between = `${GAP}*(?:${WRAP}${GAP}*)?`;
  const pattern = [...candidate].map(char => char === ICON ? `${GAP}+` :
    char === '-' ? `[-${WRAP}]` : escapePattern(char)).join(between);
  return !!pattern && new RegExp(pattern, 'u').test(evidence);
}

function pageText(asset: ReadingAsset, source: PaperSource): string | undefined {
  return source.pageTexts ? source.pageTexts[asset.page - 1] : source.text;
}

export function captionMatchesSource(asset: ReadingAsset, source: PaperSource): boolean {
  const original = pageText(asset, source);
  if (original === undefined) return false;
  const evidence = captionEvidence(original);
  const candidate = captionEvidence(asset.captionSource);
  if (!candidate) return false;
  if (evidence.includes(candidate) || matchesLayout(candidate, original)) return true;
  // Panel labels often sit above the common caption; PDF extraction may list them first.
  const panel = /\d(?:\(([a-z])\)|([a-z]))$/i.exec(asset.id);
  if (!panel) return false;
  const parts = asset.captionSource.split(/(?=\([a-z]\)\s*)/i).map(x => x.trim()).filter(Boolean);
  const parent = asset.id.replace(/(?:\([a-z]\)|[a-z])$/i, '');
  const label = /^(?:Figure|Fig\.?|Table|Algorithm)\s+(?:(?:[A-Z]\.?)?\d+(?:\.\d+)*|[IVXLCDM]+)(?=[:.\s]|$)/i.exec(parts[0] || '')?.[0];
  if (parts.length < 2 || !label || normalizedFigureId(label.replace(/^Fig\.?\s/i, 'Figure ')) !== normalizedFigureId(parent)) return false;
  const letter = (panel[1] || panel[2])!.toLowerCase();
  if (!parts.some(part => part.toLowerCase().startsWith(`(${letter})`))) return false;
  return parts.every(part => evidence.includes(captionEvidence(part)) || matchesLayout(captionEvidence(part), original));
}

/** Fix JSON-overescaped inline caption math without changing its content or block-math row breaks. */
export function normalizeReadingResult(input: ReadingResult, source?: PaperSource): { result: ReadingResult; repairs: string[] } {
  const repairs: string[] = [];
  const assets = input.assets.map(asset => {
    const captionChinese = asset.captionChinese.replace(/\$(?!\$)([^$\n]+)\$/g, (_all, math: string) =>
      `$${math.replace(/\\\\(?=(?:mathrm|mathcal|mathbb|mathbf|mathit|ldots|cdots|frac|sum|alpha|beta|gamma|theta|omega)\b|[{}])/g, '\\')}$`);
    if (captionChinese !== asset.captionChinese) repairs.push(`${asset.id}：修复行内公式的重复转义`);
    let captionSource = asset.captionSource;
    if (source && !captionMatchesSource(asset, source)) {
      const original = pageText(asset, source);
      const symbols = [...captionSource.matchAll(pictographs)].map(match => match[0]);
      // captionSource is the text-layer evidence. Inline drawings stay in the visible Chinese caption.
      // Never discard words, quantities or math operators, or match an icon where the PDF has no gap.
      if (original !== undefined && symbols.length && symbols.every(symbol => captionChinese.includes(symbol)) &&
        matchesLayout(captionEvidence(captionSource.replace(pictographs, ICON)), original)) {
        captionSource = captionSource.replace(pictographs, '');
        repairs.push(`${asset.id}：来源字段对应 PDF 文字层；内嵌图形符号 ${[...new Set(symbols)].join(' ')} 保留在中文图注`);
      }
    }
    return { ...asset, captionSource, captionChinese };
  });
  return { result: { ...input, assets }, repairs };
}
