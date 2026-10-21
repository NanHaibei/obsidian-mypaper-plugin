import type { App } from 'obsidian';
import type { MyPluginSettings } from '../settings';
import type { FieldStyle } from '../types';

export interface ClassificationHost {
  app: App;
  settings: MyPluginSettings;
  saveSettings(): Promise<void>;
}

export interface ClassificationPaper {
  path: string;
  title: string;
  fields: string[];
  content: string;
  mtime: number;
}

export interface ClassificationChange {
  path: string;
  beforeFields: string[];
  afterFields: string[];
}

export interface ClassificationPlan {
  taxonomy: FieldStyle[];
  defaultField: string;
  changes: ClassificationChange[];
}

export interface ClassificationResult {
  backupPath: string;
  updated: string[];
  skipped: Array<{ path: string; reason: string }>;
  failed: Array<{ path: string; reason: string }>;
}

export interface ClassificationBackup {
  schemaVersion: 1;
  kind: 'mypaper-classification-backup';
  createdAt: string;
  reason: string;
  workspaceFolder: string;
  settings: { fields: FieldStyle[]; defaultField: string };
  ideaFields: Array<{ id: string; field?: string }>;
  papers: Array<{ path: string; mtime: number; content: string }>;
}

export interface ClassificationBackupEntry {
  path: string;
  createdAt: string;
  count: number;
}
