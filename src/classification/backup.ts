import { normalizePath, TFile, TFolder } from 'obsidian';
import type { FieldStyle } from '../types';
import type { ClassificationBackup, ClassificationBackupEntry, ClassificationHost } from './storageTypes';

export function safeRelativePath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || /[\\\u0000\r\n]/.test(value) || value.startsWith('/') || value.split('/').some(part => part === '..' || part === '.')) {
    throw new Error('分类路径必须位于论文工作文件夹内');
  }
  return normalizePath(value);
}

export function classificationRoots(host: ClassificationHost): string[] {
  const base = safeRelativePath(host.settings.workspaceFolder);
  return Array.from(new Set([host.settings.unreadFolderName, host.settings.readFolderName].map(folder => `${base}/${safeRelativePath(folder)}`)));
}

export function isPaperPath(host: ClassificationHost, value: unknown): value is string {
  if (typeof value !== 'string' || safeRelativePath(value) !== value || !/\.md$/i.test(value)) return false;
  return classificationRoots(host).some(root => value.startsWith(`${root}/`));
}

export function paperFiles(host: ClassificationHost): TFile[] {
  const found = new Map<string, TFile>();
  const visit = (folder: TFolder): void => {
    for (const child of folder.children) {
      if (child instanceof TFolder) visit(child);
      else if (child instanceof TFile && child.extension.toLowerCase() === 'md') found.set(child.path, child);
    }
  };
  for (const root of classificationRoots(host)) {
    const folder = host.app.vault.getAbstractFileByPath(root);
    if (folder instanceof TFolder) visit(folder);
    else if (folder) throw new Error(`论文目录不是文件夹：${root}`);
  }
  return Array.from(found.values()).sort((a, b) => a.path.localeCompare(b.path));
}

export function cloneTaxonomy(fields: FieldStyle[]): FieldStyle[] {
  // Explicit allowlist: no unrelated plugin settings or credentials enter the backup.
  return fields.map(field => ({
    name: field.name, aliases: field.aliases ? [...field.aliases] : undefined,
    backgroundColor: field.backgroundColor, backgroundPattern: field.backgroundPattern,
    patternColor: field.patternColor, textColor: field.textColor,
    titleTextColor: field.titleTextColor, metaTextColor: field.metaTextColor,
    borderColor: field.borderColor, roughness: field.roughness,
    opacity: field.opacity, roundness: field.roundness,
    titleFontSize: field.titleFontSize, titleFontFamily: field.titleFontFamily,
    metaFontSize: field.metaFontSize, metaFontFamily: field.metaFontFamily,
    cardWidth: field.cardWidth, cardHeight: field.cardHeight,
    titleAlignment: field.titleAlignment ?? 'left',
  }));
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validateTaxonomy(value: unknown): asserts value is FieldStyle[] {
  if (!Array.isArray(value) || !value.length) throw new Error('领域列表不能为空');
  for (const field of value) {
    if (!record(field) || typeof field.name !== 'string' || !field.name.trim() || /[\r\n]/.test(field.name)) throw new Error('领域名称无效');
    for (const key of ['backgroundColor', 'textColor', 'borderColor']) {
      if (typeof field[key] !== 'string') throw new Error(`领域样式 ${key} 无效`);
    }
    for (const key of ['titleTextColor', 'metaTextColor', 'patternColor']) {
      if (field[key] !== undefined && typeof field[key] !== 'string') throw new Error(`领域样式 ${key} 无效`);
    }
    for (const key of ['roughness', 'opacity', 'roundness', 'titleFontSize', 'titleFontFamily', 'metaFontSize', 'metaFontFamily', 'cardWidth', 'cardHeight']) {
      if (typeof field[key] !== 'number' || !Number.isFinite(field[key])) throw new Error(`领域样式 ${key} 无效`);
    }
    if (field.titleAlignment !== undefined && !['left', 'center'].includes(String(field.titleAlignment))) throw new Error('领域标题对齐方式无效');
    if (field.backgroundPattern !== undefined && !['solid', 'dots', 'grid', 'lines', 'cross-hatch'].includes(String(field.backgroundPattern))) throw new Error('领域纹理无效');
    if (field.aliases !== undefined && (!Array.isArray(field.aliases) || field.aliases.some(alias => typeof alias !== 'string' || !alias.trim() || /[\r\n]/.test(alias)))) throw new Error('子领域列表无效');
  }
}

export function validateBackup(host: ClassificationHost, value: unknown): ClassificationBackup {
  if (!record(value) || value.schemaVersion !== 1 || value.kind !== 'mypaper-classification-backup' || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || typeof value.reason !== 'string') throw new Error('不是有效的论文分类备份');
  if (value.workspaceFolder !== host.settings.workspaceFolder) throw new Error('备份的工作文件夹与当前设置不同');
  if (!record(value.settings) || typeof value.settings.defaultField !== 'string') throw new Error('备份领域设置无效');
  validateTaxonomy(value.settings.fields);
  if (!Array.isArray(value.papers) || !Array.isArray(value.ideaFields)) throw new Error('备份内容不完整');
  const paths = new Set<string>();
  for (const paper of value.papers) {
    if (!record(paper) || !isPaperPath(host, paper.path) || paths.has(paper.path) || typeof paper.content !== 'string' || typeof paper.mtime !== 'number' || !Number.isFinite(paper.mtime)) throw new Error('备份含有无效、重复或超出论文目录的路径');
    paths.add(paper.path);
  }
  const ids = new Set<string>();
  for (const idea of value.ideaFields) {
    if (!record(idea) || typeof idea.id !== 'string' || ids.has(idea.id) || (idea.field !== undefined && typeof idea.field !== 'string')) throw new Error('备份灵感领域无效');
    ids.add(idea.id);
  }
  return value as unknown as ClassificationBackup;
}

export function backupFolder(host: ClassificationHost): string {
  return `${safeRelativePath(host.settings.workspaceFolder)}/分类备份`;
}

async function ensureFolder(host: ClassificationHost, path: string): Promise<void> {
  const parts = path.split('/');
  for (let index = 1; index <= parts.length; index++) {
    const current = parts.slice(0, index).join('/');
    const existing = host.app.vault.getAbstractFileByPath(current);
    if (existing && !(existing instanceof TFolder)) throw new Error(`备份目录被同名文件占用：${current}`);
    if (!existing) await host.app.vault.createFolder(current);
  }
}

export async function writeClassificationBackup(host: ClassificationHost, reason: string): Promise<string> {
  const papers: ClassificationBackup['papers'] = [];
  for (const file of paperFiles(host)) {
    papers.push({ path: file.path, mtime: file.stat.mtime, content: await host.app.vault.read(file) });
  }
  const snapshot: ClassificationBackup = {
    schemaVersion: 1, kind: 'mypaper-classification-backup', createdAt: new Date().toISOString(), reason,
    workspaceFolder: host.settings.workspaceFolder,
    settings: { fields: cloneTaxonomy(host.settings.fields), defaultField: host.settings.defaultField },
    ideaFields: (host.settings.ideas || []).filter(idea => !idea.isCustomTag).map(idea => ({ id: idea.id, ...(idea.field === undefined ? {} : { field: idea.field }) })),
    papers,
  };
  validateBackup(host, snapshot);
  const folder = backupFolder(host);
  await ensureFolder(host, folder);
  const name = `分类备份-${snapshot.createdAt.replace(/[:.]/g, '-')}`;
  let path = `${folder}/${name}.json`;
  let suffix = 1;
  while (host.app.vault.getAbstractFileByPath(path)) path = `${folder}/${name}-${suffix++}.json`;
  const serialized = JSON.stringify(snapshot, null, 2);
  const file = await host.app.vault.create(path, serialized);
  const verified = await host.app.vault.read(file);
  if (verified !== serialized) throw new Error('分类备份写入校验失败，已停止修改');
  validateBackup(host, JSON.parse(verified) as unknown);
  return path;
}

export async function readClassificationBackup(host: ClassificationHost, path: string): Promise<ClassificationBackup> {
  if (safeRelativePath(path) !== path || !path.startsWith(`${backupFolder(host)}/`) || !path.endsWith('.json')) throw new Error('请选择当前工作文件夹中的分类备份');
  const file = host.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) throw new Error('分类备份不存在');
  return validateBackup(host, JSON.parse(await host.app.vault.read(file)) as unknown);
}

export async function listClassificationBackups(host: ClassificationHost): Promise<ClassificationBackupEntry[]> {
  const folder = host.app.vault.getAbstractFileByPath(backupFolder(host));
  if (!(folder instanceof TFolder)) return [];
  const results: ClassificationBackupEntry[] = [];
  for (const file of folder.children) {
    if (!(file instanceof TFile) || file.extension !== 'json') continue;
    try {
      const backup = await readClassificationBackup(host, file.path);
      results.push({ path: file.path, createdAt: backup.createdAt, count: backup.papers.length });
    } catch { /* An unrelated or damaged JSON file is not offered for restoration. */ }
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
