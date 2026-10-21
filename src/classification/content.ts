import { getFrontMatterInfo, parseYaml, stringifyYaml } from 'obsidian';
import { normalizePaperFields } from '../utils/paperFields';

type Metadata = Record<string, unknown>;
const own = (value: Metadata, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const generatedFieldLine = /^\*\*研究领域\*\*[：:][^\r\n]*(?:\r?\n|$)/m;

export function readPaperMetadata(content: string): Metadata {
  const info = getFrontMatterInfo(content);
  if (!info.exists || !info.frontmatter.trim()) return {};
  const parsed: unknown = parseYaml(info.frontmatter);
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('论文 YAML 必须为属性对象');
  }
  return parsed as Metadata;
}

/** Only remove the two top-level classification properties, keeping other YAML text. */
function withoutClassification(yaml: string): string {
  const lines = yaml.match(/[^\r\n]*(?:\r\n|\n|$)/g)?.filter(Boolean) || [];
  let removing = false;
  const kept: string[] = [];
  for (const line of lines) {
    if (/^(?:field|fields|"field"|"fields"|'field'|'fields')\s*:/.test(line)) {
      removing = true;
      continue;
    }
    if (/^[^\s#-]/.test(line)) removing = false;
    if (!removing || /^\s*(?:#.*)?(?:\r?\n)?$/.test(line)) kept.push(line);
  }
  return kept.join('');
}

function rewriteMetadata(content: string, target: Metadata): string {
  const original = readPaperMetadata(content);
  const info = getFrontMatterInfo(content);
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const fields: Metadata = {};
  for (const key of ['field', 'fields']) if (own(target, key)) fields[key] = target[key];
  const serialized = Object.keys(fields).length ? stringifyYaml(fields).replace(/\r?\n/g, newline) : '';
  let result: string;
  if (info.exists) {
    let remaining = withoutClassification(info.frontmatter);
    if (remaining && !remaining.endsWith('\n')) remaining += newline;
    result = content.slice(0, info.from) + remaining + serialized + content.slice(info.to);
  } else if (serialized) {
    const bom = content.startsWith('\uFEFF') ? '\uFEFF' : '';
    result = bom + `---${newline}${serialized}---${newline}` + content.slice(bom.length);
  } else {
    return content;
  }
  // Unsupported YAML constructs (flow maps/anchors) fail safely instead of damaging metadata.
  const actual = readPaperMetadata(result);
  const expected: Metadata = { ...original };
  for (const key of ['field', 'fields']) {
    delete expected[key];
    if (own(target, key)) expected[key] = target[key];
  }
  const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)) {
      const sorted: Metadata = {};
      for (const key of Object.keys(item).sort()) sorted[key] = (item as Metadata)[key];
      return sorted;
    }
    return item;
  });
  if (canonical(actual) !== canonical(expected)) throw new Error('无法安全修改此论文的 YAML，请手动检查格式');
  return result;
}

function replaceGeneratedLine(content: string, replacement: string | undefined): string {
  const info = getFrontMatterInfo(content);
  const bodyStart = info.exists ? info.contentStart : 0;
  const body = content.slice(bodyStart);
  // This is the metadata line before the first section, never a line inside notes/code.
  const section = body.search(/^##(?:\s|$)|^\s*(?:```|~~~)/m);
  const metadataEnd = section < 0 ? body.length : section;
  const header = body.slice(0, metadataEnd);
  const match = generatedFieldLine.exec(header);
  if (!match) return content;
  const newline = match[0].endsWith('\r\n') ? '\r\n' : match[0].endsWith('\n') ? '\n' : '';
  const next = replacement === undefined ? '' : replacement.replace(/\r?\n$/, '') + newline;
  return content.slice(0, bodyStart) + header.slice(0, match.index) + next + header.slice(match.index + match[0].length) + body.slice(metadataEnd);
}

export function applyPaperClassification(content: string, fields: string[]): string {
  const normalized = normalizePaperFields({ fields });
  if (!normalized.length) throw new Error('每篇论文至少需要一个领域');
  const result = rewriteMetadata(content, { field: normalized[0], fields: normalized });
  return replaceGeneratedLine(result, `**研究领域**：${normalized.join(' / ')}  `);
}

export function restorePaperClassification(content: string, snapshotContent: string): string {
  const result = rewriteMetadata(content, readPaperMetadata(snapshotContent));
  const info = getFrontMatterInfo(snapshotContent);
  const body = snapshotContent.slice(info.exists ? info.contentStart : 0);
  const section = body.search(/^##(?:\s|$)|^\s*(?:```|~~~)/m);
  const oldLine = generatedFieldLine.exec(section < 0 ? body : body.slice(0, section));
  return replaceGeneratedLine(result, oldLine?.[0]);
}
