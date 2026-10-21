import { TFile } from 'obsidian';
import { normalizePaperFields } from '../utils/paperFields';
import { applyPaperClassification, readPaperMetadata, restorePaperClassification } from './content';
import { cloneTaxonomy, isPaperPath, paperFiles, readClassificationBackup, validateTaxonomy, writeClassificationBackup } from './backup';
import { preserveUnchangedFields } from './preserveFields';
import type { ClassificationHost, ClassificationPaper, ClassificationPlan, ClassificationResult } from './storageTypes';

export type { ClassificationHost, ClassificationPaper, ClassificationChange, ClassificationPlan, ClassificationResult, ClassificationBackup, ClassificationBackupEntry } from './storageTypes';
export { listClassificationBackups } from './backup';

// Shared by every modal/command and keyed by vault, so two batches never overlap.
const busyVaults = new WeakSet<object>();
async function exclusive<T>(host: ClassificationHost, operation: () => Promise<T>): Promise<T> {
  const vault = host.app.vault;
  if (busyVaults.has(vault)) throw new Error('已有分类备份或整理正在进行，请稍后重试');
  busyVaults.add(vault);
  try { return await operation(); } finally { busyVaults.delete(vault); }
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
class ClassificationConflict extends Error {}

export async function scanClassificationPapers(host: ClassificationHost): Promise<ClassificationPaper[]> {
  const papers: ClassificationPaper[] = [];
  for (const file of paperFiles(host)) {
    const content = await host.app.vault.read(file);
    try {
      const metadata = readPaperMetadata(content);
      papers.push({ path: file.path, title: typeof metadata.title === 'string' && metadata.title.trim() ? metadata.title : file.basename,
        fields: normalizePaperFields(metadata), content, mtime: file.stat.mtime });
    } catch (error) { throw new Error(`无法读取论文分类「${file.path}」：${errorMessage(error)}`); }
  }
  return papers;
}

export async function createClassificationBackup(host: ClassificationHost, reason: string): Promise<string> {
  return exclusive(host, () => writeClassificationBackup(host, reason));
}

function validatePlan(host: ClassificationHost, papers: ClassificationPaper[], plan: ClassificationPlan): void {
  validateTaxonomy(plan.taxonomy);
  const labels = new Set<string>();
  for (const field of plan.taxonomy) {
    for (const label of [field.name, ...(field.aliases || [])]) {
      if (labels.has(label)) throw new Error(`领域名称重复：${label}`);
      labels.add(label);
    }
  }
  if (!plan.taxonomy.some(field => field.name === plan.defaultField)) throw new Error('默认领域必须为主领域');
  const sources = new Map(papers.map(paper => [paper.path, paper]));
  if (sources.size !== papers.length) throw new Error('论文预览含重复路径，请重新扫描');
  const changed = new Set<string>();
  for (const change of plan.changes) {
    if (!isPaperPath(host, change.path) || changed.has(change.path)) throw new Error('分类计划含重复路径或超出论文目录');
    changed.add(change.path);
    const source = sources.get(change.path);
    if (!source || JSON.stringify(source.fields) !== JSON.stringify(change.beforeFields)) throw new Error('分类预览已失效，请重新扫描');
    if (!Array.isArray(change.afterFields) || !change.afterFields.length || change.afterFields.some(field => typeof field !== 'string' || !field.trim() || /[\r\n]/.test(field)) || JSON.stringify(normalizePaperFields({ fields: change.afterFields })) !== JSON.stringify(change.afterFields)) throw new Error('论文分类不能为空或包含无效标签');
  }
}

async function saveClassificationSettings(host: ClassificationHost, plan: Pick<ClassificationPlan, 'taxonomy' | 'defaultField'>, result: ClassificationResult, ideaFields?: Array<{ id: string; field?: string }>): Promise<void> {
  const previous = { fields: host.settings.fields, defaultField: host.settings.defaultField,
    ideas: (host.settings.ideas || []).map(idea => ({ id: idea.id, field: idea.field })) };
  host.settings.fields = cloneTaxonomy(plan.taxonomy);
  host.settings.defaultField = plan.defaultField;
  if (ideaFields) {
    const saved = new Map(ideaFields.map(idea => [idea.id, idea]));
    for (const idea of host.settings.ideas || []) {
      const target = saved.get(idea.id);
      if (target && !idea.isCustomTag) {
        if (target.field === undefined) delete idea.field;
        else idea.field = target.field;
      }
    }
  }
  try { await host.saveSettings(); }
  catch (error) {
    host.settings.fields = previous.fields;
    host.settings.defaultField = previous.defaultField;
    const oldIdeas = new Map(previous.ideas.map(idea => [idea.id, idea.field]));
    for (const idea of host.settings.ideas || []) {
      if (oldIdeas.has(idea.id)) {
        const field = oldIdeas.get(idea.id);
        if (field === undefined) delete idea.field;
        else idea.field = field;
      }
    }
    result.failed.push({ path: '插件领域设置', reason: `设置保存失败：${errorMessage(error)}。已保留修改前备份，可通过恢复重试。` });
  }
}

export async function applyClassificationPlan(host: ClassificationHost, papers: ClassificationPaper[], plan: ClassificationPlan): Promise<ClassificationResult> {
  return exclusive(host, async () => {
    validatePlan(host, papers, plan);
    const backupPath = await writeClassificationBackup(host, '应用领域整理前');
    const backedUp = new Map((await readClassificationBackup(host, backupPath)).papers.map(paper => [paper.path, paper.content]));
    const result: ClassificationResult = { backupPath, updated: [], skipped: [], failed: [] };
    const sources = new Map(papers.map(paper => [paper.path, paper]));
    for (const change of plan.changes) {
      const file = host.app.vault.getAbstractFileByPath(change.path);
      if (!(file instanceof TFile)) { result.skipped.push({ path: change.path, reason: '论文已删除或移动' }); continue; }
      const source = sources.get(change.path)!;
      let modified = false;
      try {
        await host.app.vault.process(file, current => {
          if (file.path !== change.path || current !== source.content || current !== backedUp.get(change.path)) {
            throw new ClassificationConflict('预览或备份后论文内容发生变化，请重新扫描后再应用');
          }
          const next = applyPaperClassification(current, change.afterFields);
          modified = next !== current;
          return next;
        });
        if (modified) result.updated.push(change.path);
      } catch (error) {
        const target = error instanceof ClassificationConflict ? result.skipped : result.failed;
        target.push({ path: change.path, reason: errorMessage(error) });
      }
    }
    const taxonomy = await preserveUnchangedFields(host, plan.taxonomy, result, backedUp);
    await saveClassificationSettings(host, { taxonomy, defaultField: plan.defaultField }, result);
    return result;
  });
}

export async function restoreClassificationBackup(host: ClassificationHost, path: string): Promise<ClassificationResult> {
  return exclusive(host, async () => {
    const snapshot = await readClassificationBackup(host, path);
    const backupPath = await writeClassificationBackup(host, '恢复分类备份前');
    const backedUp = new Map((await readClassificationBackup(host, backupPath)).papers.map(paper => [paper.path, paper.content]));
    const result: ClassificationResult = { backupPath, updated: [], skipped: [], failed: [] };
    for (const paper of snapshot.papers) {
      const file = host.app.vault.getAbstractFileByPath(paper.path);
      if (!(file instanceof TFile)) { result.skipped.push({ path: paper.path, reason: '论文已删除或移动，未重新创建' }); continue; }
      let modified = false;
      try {
        await host.app.vault.process(file, current => {
          if (file.path !== paper.path || current !== backedUp.get(paper.path)) {
            throw new ClassificationConflict('备份后论文发生变化或移动，请重新恢复');
          }
          const next = restorePaperClassification(current, paper.content);
          modified = next !== current;
          return next;
        });
        if (modified) result.updated.push(paper.path);
      } catch (error) {
        const target = error instanceof ClassificationConflict ? result.skipped : result.failed;
        target.push({ path: paper.path, reason: errorMessage(error) });
      }
    }
    const taxonomy = await preserveUnchangedFields(host, snapshot.settings.fields, result, backedUp);
    await saveClassificationSettings(host, { taxonomy, defaultField: snapshot.settings.defaultField }, result, snapshot.ideaFields);
    return result;
  });
}
