import type { FieldStyle } from '../types';
import { normalizePaperFields } from '../utils/paperFields';
import { cloneTaxonomy, paperFiles } from './backup';
import { readPaperMetadata } from './content';
import type { ClassificationHost, ClassificationResult } from './storageTypes';

/** Keep untouched, new and concurrently moved notes visible under their classification. */
export async function preserveUnchangedFields(
  host: ClassificationHost,
  proposed: FieldStyle[],
  result: ClassificationResult,
  backedUp: Map<string, string>
): Promise<FieldStyle[]> {
  const taxonomy = cloneTaxonomy(proposed);
  const known = new Set(taxonomy.reduce<string[]>((all, field) => all.concat(field.name, field.aliases || []), []));
  const updated = new Set(result.updated);
  const restored: string[] = [];
  const retain = (name: string): void => {
    if (known.has(name)) return;
    const original = host.settings.fields.find(field => field.name === name || field.aliases?.includes(name));
    const template = original || host.settings.fields.find(field => field.name === host.settings.defaultField) || taxonomy[0]!;
    const existingParent = original && taxonomy.find(field => field.name === original.name);
    if (existingParent && original?.name !== name) {
      existingParent.aliases = [...(existingParent.aliases || []), name];
    } else {
      const [preserved] = cloneTaxonomy([template]);
      if (!preserved) return;
      preserved.name = original && !known.has(original.name) ? original.name : name;
      preserved.aliases = preserved.name === name ? [] : [name];
      taxonomy.push(preserved);
      known.add(preserved.name);
    }
    known.add(name);
    restored.push(name);
  };
  for (const file of paperFiles(host)) {
    if (updated.has(file.path)) continue;
    let fields: string[];
    try {
      fields = normalizePaperFields(readPaperMetadata(await host.app.vault.read(file)), host.settings.defaultField);
    } catch {
      // If a concurrently edited note becomes unreadable, retain the old tree conservatively.
      for (const field of host.settings.fields) for (const label of [field.name, ...(field.aliases || [])]) retain(label);
      try { fields = normalizePaperFields(readPaperMetadata(backedUp.get(file.path) || ''), host.settings.defaultField); }
      catch { fields = []; }
    }
    const missing = fields.filter(label => !known.has(label));
    for (const label of fields) retain(label);
    if (missing.length && ![...result.skipped, ...result.failed].some(entry => entry.path === file.path)) {
      result.skipped.push({ path: file.path, reason: '这篇论文不在本次修改范围内，保留现有分类' });
    }
  }
  if (restored.length) {
    const message = `已保留未更新论文仍使用的领域：${restored.join('、')}`;
    for (const entry of [...result.skipped, ...result.failed]) entry.reason += `；${message}`;
  }
  return taxonomy;
}
