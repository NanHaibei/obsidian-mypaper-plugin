import type { FieldStyle } from '../../types';
import type { ClassificationPaper } from '../../classification/storage';

export interface PaperDraft {
  paper: ClassificationPaper;
  fields: string[];
  selected: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface OrganizerDraft {
  taxonomy: FieldStyle[];
  defaultField: string;
  rows: PaperDraft[];
}

export function labels(taxonomy: FieldStyle[]): string[] {
  return taxonomy.reduce<string[]>((all, field) => all.concat(field.name, field.aliases || []), []);
}

export function splitLabels(value: string): string[] {
  return [...new Set(value.split(/[,，;；\n]/).map(label => label.trim()).filter(Boolean))];
}

export function changed(row: PaperDraft): boolean {
  return JSON.stringify(row.paper.fields) !== JSON.stringify(row.fields);
}

export function displayFields(fields: string[]): string {
  return fields.length ? fields.join(' / ') : '未分类';
}

export function newField(name: string, base?: FieldStyle): FieldStyle {
  return {
    backgroundColor: '#e3f2fd', textColor: '#1565c0', borderColor: '#64b5f6',
    roughness: 0, opacity: 100, roundness: 2, titleFontSize: 14, titleFontFamily: 4,
    metaFontSize: 11, metaFontFamily: 4, cardWidth: 280, cardHeight: 180,
    titleAlignment: 'left', ...base, name, aliases: [],
  };
}

export function preserveUnknownLabels(draft: OrganizerDraft): void {
  const known = new Set(labels(draft.taxonomy));
  const unknown = [...new Set(draft.rows.reduce<string[]>((all, row) => all.concat(row.fields), []).filter(label => !known.has(label)))];
  if (!unknown.length) return;
  let name = 'Unsorted';
  while (known.has(name) || unknown.includes(name)) name += ' copy';
  draft.taxonomy.push({ ...newField(name, draft.taxonomy[0]), aliases: unknown });
}

export function migrateLabel(draft: OrganizerDraft, before: string, after: string): void {
  if (!before || !after || before === after) return;
  const owner = draft.taxonomy.find(field => field.name === after || field.aliases?.includes(after));
  for (const row of draft.rows) {
    if (!row.fields.includes(before)) continue;
    const wasPrimary = row.fields[0] === before;
    row.fields = [...new Set(row.fields.map(label => label === before ? after : label))];
    if (wasPrimary && owner && owner.name !== after) row.fields = [owner.name, ...row.fields.filter(label => label !== owner.name)];
    row.selected = true;
    row.reason = `已在草稿中将「${before}」迁移至「${after}」`;
  }
  if (draft.defaultField === before) draft.defaultField = owner?.name || after;
}

export function mergeMainFields(draft: OrganizerDraft, before: string, after: string): void {
  if (!before || !after || before === after) return;
  const source = draft.taxonomy.find(field => field.name === before);
  const target = draft.taxonomy.find(field => field.name === after);
  if (!source || !target) return;
  target.aliases = [...new Set([...(target.aliases || []), ...(source.aliases || [])])].filter(label => label !== after);
  migrateLabel(draft, before, after);
  draft.taxonomy = draft.taxonomy.filter(field => field !== source);
}

export function setMainField(row: PaperDraft, main: string, taxonomy: FieldStyle[]): void {
  const remaining = taxonomy.some(field => field.name === row.fields[0]) ? row.fields.slice(1) : row.fields;
  row.fields = [main, ...remaining.filter(label => label !== main)].filter(Boolean);
  row.selected = true;
  row.reason = '已手动修改；补充标签保留，可单独调整';
}

export function validateDraft(draft: OrganizerDraft): string | null {
  if (!draft.taxonomy.length) return '请至少保留一个主领域。';
  const seen = new Set<string>();
  for (const field of draft.taxonomy) {
    if (!field.name.trim()) return '主领域名称不能为空。';
    for (const label of [field.name, ...(field.aliases || [])]) {
      if (!label.trim()) return '子领域名称不能为空。';
      if (seen.has(label)) return `「${label}」重复出现，请合并或改名。`;
      seen.add(label);
    }
  }
  if (!draft.taxonomy.some(field => field.name === draft.defaultField)) return '请选择一个有效的默认主领域。';
  const missing = new Set<string>();
  for (const row of draft.rows) {
    const fields = row.selected ? row.fields : row.paper.fields;
    fields.filter(label => !seen.has(label)).forEach(label => missing.add(label));
    if (row.selected && changed(row) && !fields.length) return `「${row.paper.title}」尚未选择主领域。`;
    if (row.selected && changed(row) && !draft.taxonomy.some(field => field.name === fields[0])) {
      return `请为「${row.paper.title}」选择主领域，主领域应排在第一位。`;
    }
  }
  return missing.size ? `仍有论文使用未定义的标签：${[...missing].join('、')}。请保留这些标签，或迁移后勾选对应论文。` : null;
}
