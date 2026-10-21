import type { MyPluginSettings } from '../settings';

export interface PaperFieldSource {
  field?: unknown;
  fields?: unknown;
}

export function normalizePaperFields(
  source: PaperFieldSource | undefined,
  fallbackField?: string
): string[] {
  const values: string[] = [];

  if (Array.isArray(source?.fields)) {
    for (const value of source.fields) {
      if (typeof value === 'string' && value.trim()) {
        values.push(value.trim());
      }
    }
  } else if (typeof source?.fields === 'string' && source.fields.trim()) {
    values.push(source.fields.trim());
  }

  if (typeof source?.field === 'string' && source.field.trim()) {
    values.push(source.field.trim());
  }

  const uniqueValues = Array.from(new Set(values));
  if (uniqueValues.length > 0) {
    return uniqueValues;
  }

  return fallbackField ? [fallbackField] : [];
}

export function getPrimaryPaperField(
  source: PaperFieldSource | undefined,
  fallbackField?: string
): string {
  return normalizePaperFields(source, fallbackField)[0] || fallbackField || '';
}

export function resolveMainFieldName(
  settings: Pick<MyPluginSettings, 'fields'>,
  fieldName: string
): string {
  for (const field of settings.fields) {
    if (field.name === fieldName || field.aliases?.includes(fieldName)) {
      return field.name;
    }
  }

  return fieldName;
}

/** Choose the one main field shown on the paper, independently of method tags. */
export function getMainPaperField(
  settings: Pick<MyPluginSettings, 'fields'>,
  source: PaperFieldSource | undefined,
  fallbackField?: string
): string {
  const names = normalizePaperFields(source, fallbackField);
  const explicit = names.find(name => settings.fields.some(field => field.name === name));
  return explicit || resolveMainFieldName(settings, names[0] || '') || 'Unsorted';
}

export function paperMatchesField(
  settings: MyPluginSettings,
  source: PaperFieldSource | undefined,
  targetFieldName: string,
  fallbackField?: string
): boolean {
  const targetField = settings.fields.find(field => field.name === targetFieldName);
  const paperFields = normalizePaperFields(source, fallbackField);

  return paperFields.some(fieldName => {
    if (fieldName === targetFieldName) {
      return true;
    }

    return Boolean(targetField?.aliases?.includes(fieldName));
  });
}
