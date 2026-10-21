import type { MyPluginSettings } from '../settings';
import { getMainPaperField, PaperFieldSource } from './paperFields';

export interface PrimaryFieldGroup<T> {
  name: string;
  count: number;
  color: string;
  papers: T[];
}

/** Each unique paper belongs to exactly one group, including unknown labels. */
export function getPrimaryFieldGroups<T extends { path: string }>(
  settings: Pick<MyPluginSettings, 'fields' | 'defaultField'>,
  papers: T[],
  readFields: (paper: T) => PaperFieldSource | undefined,
): PrimaryFieldGroup<T>[] {
  const groups = new Map<string, PrimaryFieldGroup<T>>();
  for (const field of settings.fields) {
    groups.set(field.name, { name: field.name, count: 0, color: field.backgroundColor, papers: [] });
  }
  const seen = new Set<string>();
  for (const paper of papers) {
    if (seen.has(paper.path)) continue;
    seen.add(paper.path);
    const name = getMainPaperField(settings, readFields(paper), settings.defaultField) || 'Unsorted';
    let group = groups.get(name);
    if (!group) {
      group = { name, count: 0, color: 'var(--text-muted)', papers: [] };
      groups.set(name, group);
    }
    group.papers.push(paper);
    group.count++;
  }
  return [...groups.values()].filter(group => group.count > 0);
}
