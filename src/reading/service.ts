import { Notice, Platform, TFile } from 'obsidian';
import type PaperPlugin from '../main';
import type { PaperInfo } from '../types';
import { type ReadingSettings, normalizeReadingSettings } from './config';
import { ReadingJobStore, canonicalPaperId, type ReadingJob } from './jobs';
import { checkCropRuntime, collectStyleSamples, copySkill, preparePaperSource, vaultBase } from './context';
import { readExistingPaper } from './paperMetadata';
import { runReadingSkill } from './runner';
import { appendReadingNote, noteHash, renderReadingNote } from './noteContent';
import { inspectReadingAssets } from './assets';
import { reviewReadingResult } from './review';
import { parseReadingResult } from './result';
import { writeTaskJson } from './taskFiles';
import { normalizePaperFields } from '../utils/paperFields';
import { getPaperUrl } from '../utils/paperLinks';

export class PaperReading {
  readonly jobs: ReadingJob[] = [];
  private store: ReadingJobStore;
  private ready: Promise<void>;
  private active?: AbortController;
  private activeJob?: ReadingJob;
  private running = false;
  private disposed = false;
  private storageError = '';
  private directory: string;
  private listeners = new Set<() => void>();
  constructor(private plugin: PaperPlugin) {
    this.directory = plugin.manifest.dir || `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
    this.store = new ReadingJobStore(plugin.app.vault.adapter, `${this.directory}/paper-reading-jobs.json`);
    this.ready = this.load();
    plugin.register(() => { this.disposed = true; this.active?.abort(); });
    plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => {
      for (const job of this.jobs) if (job.path === oldPath || job.path.startsWith(oldPath + '/')) job.path = file.path + job.path.slice(oldPath.length);
      void this.persist().catch(() => {});
    }));
    plugin.registerEvent(plugin.app.vault.on('delete', file => {
      for (const job of this.jobs) if (job.path === file.path || job.path.startsWith(file.path + '/')) {
        job.deleted = true; job.status = 'cancelled'; job.phase = '论文已删除';
        if (this.activeJob === job) this.active?.abort();
      }
      void this.persist().catch(() => {});
    }));
    plugin.addCommand({ id: 'retry-paper-reading', name: '重试未完成的论文阅读任务', callback: () => { void this.retryFailed(); } });
    plugin.app.workspace.onLayoutReady(() => { void this.refresh(); });
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify(): void { for (const listener of this.listeners) { try { listener(); } catch { /* A detached view must not fail the job. */ } } }
  private async persist(): Promise<void> {
    try { await this.store.save(this.jobs); this.notify(); }
    catch (error) { this.storageError = this.message(error); new Notice(this.storageError); throw error; }
  }
  private async load(): Promise<void> {
    try {
      this.jobs.push(...await this.store.load());
      for (const job of this.jobs) if (job.status === 'running') {
        job.status = 'failed'; job.error = '上次任务中断，材料已保留，请重试';
      }
      // Recover drafts discarded by earlier validator versions; no model call is needed to review them again.
      for (const job of this.jobs) if (job.status === 'failed' && !job.deleted && !job.result && job.source) {
        const folder = job.attempt ? `${job.id}-attempt-${job.attempt}` : job.id;
        const draft = `${this.directory}/paper-reading-runtime/${folder}/rejected-result.json`;
        if (await this.plugin.app.vault.adapter.exists(draft)) {
          try { job.result = parseReadingResult(await this.plugin.app.vault.adapter.read(draft)); }
          catch { /* Keep the original draft and failure for review. */ }
        }
      }
    } catch (error) { this.storageError = this.message(error); }
  }
  statusFor(path: string): ReadingJob | undefined { return this.jobs.find(j => j.path === path && !j.deleted); }
  cancel(path: string): void {
    const job = this.statusFor(path); if (!job || !['queued', 'running'].includes(job.status)) return;
    job.status = 'cancelled'; job.phase = '已取消';
    if (this.activeJob === job) this.active?.abort();
    void this.persist().catch(() => {});
  }
  async generateForFile(file: TFile): Promise<void> {
    try {
      const paper = readExistingPaper(await this.plugin.app.vault.read(file), file.basename);
      // An explicit action on an existing paper confirms the classification shown in its row.
      paper.fields = normalizePaperFields(paper, this.plugin.settings.defaultField);
      paper.field = paper.fields[0];
      await this.enqueue(file, paper);
    }
    catch (error) { new Notice(this.message(error)); }
  }
  async enqueue(file: TFile, paper: PaperInfo, choice?: Pick<ReadingSettings, 'model' | 'effort'>): Promise<void> {
    await this.ready;
    if (!Platform.isDesktopApp) throw new Error('论文 Skill 运行需要桌面端');
    if (this.disposed || this.storageError) throw new Error(this.storageError || '插件已卸载');
    if (!paper.field && !paper.fields?.length) throw new Error('请先在论文领域中确认分类');
    if (!getPaperUrl(paper) && !paper.arxivId) throw new Error('请补充 DOI、arXiv ID 或原文网址');
    const existing = this.jobs.find(j => !j.deleted && (j.path === file.path || canonicalPaperId(j.paper) === canonicalPaperId(paper)));
    if (existing) {
      if (['queued', 'running'].includes(existing.status)) { new Notice('这篇论文已在阅读队列中'); return; }
      if (existing.status === 'completed' && existing.written && (await this.plugin.app.vault.read(file)).includes(existing.written)) {
        new Notice('论文阅读笔记已完成'); return;
      }
      existing.path = file.path; existing.status = 'queued'; existing.error = undefined; existing.writeBaseHash = undefined; existing.repairAttempts = 0;
      if (canonicalPaperId(existing.paper) !== canonicalPaperId(paper) || getPaperUrl(existing.paper) !== getPaperUrl(paper)) { existing.result = undefined; existing.source = undefined; }
      if (!existing.result) {
        if (canonicalPaperId(existing.paper) !== canonicalPaperId(paper) || getPaperUrl(existing.paper) !== getPaperUrl(paper)) existing.source = undefined;
        existing.paper = paper;
      }
      // Retrying preserves the model chosen for this task.
    } else {
      const settings = this.plugin.settings.paperReading;
      this.jobs.push({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        path: file.path, paper, choice: { model: choice?.model ?? settings.model, effort: choice?.effort ?? settings.effort }, status: 'queued', phase: '等待处理' });
    }
    await this.persist();
    if (this.storageError) throw new Error(this.storageError);
    new Notice('已添加论文并加入阅读队列'); void this.refresh();
  }
  async retryFailed(): Promise<void> {
    await this.ready;
    if (this.storageError || this.disposed) { new Notice(this.storageError || '插件已卸载'); return; }
    for (const job of this.jobs) if (job.status === 'failed' && !job.deleted) { job.status = 'queued'; job.error = undefined; job.writeBaseHash = undefined; job.repairAttempts = 0; }
    await this.persist(); void this.refresh();
  }
  async refresh(): Promise<void> {
    await this.ready;
    if (this.running || this.disposed || this.storageError || !Platform.isDesktopApp) return;
    this.running = true;
    try {
      let job: ReadingJob | undefined;
      while (!this.disposed && !this.storageError && (job = this.jobs.find(j => j.status === 'queued' && !j.deleted))) await this.run(job);
    } finally { this.running = false; }
  }
  private async run(job: ReadingJob): Promise<void> {
    const { vault } = this.plugin.app;
    const fs = require('fs/promises') as typeof import('fs/promises');
    const path = require('path') as typeof import('path');
    const controller = new AbortController(); this.active = controller; this.activeJob = job;
    const progress = (phase: string) => { job.phase = phase; job.lastActivityAt = Date.now(); this.notify(); };
    job.status = 'running'; job.phase = '准备论文阅读任务'; job.startedAt = Date.now(); job.lastActivityAt = job.startedAt;
    const tick = setInterval(() => { if (!this.disposed) this.notify(); }, 5000);
    try {
      await this.persist();
      if (this.storageError) throw new Error(this.storageError);
      const file = vault.getAbstractFileByPath(job.path);
      if (!(file instanceof TFile)) throw new Error('对应论文文件不存在');
      const base = vaultBase(vault);
      // A new model attempt gets a clean directory; previous model-created links cannot affect host preparation.
      if (!job.result) { job.attempt = (job.attempt || 0) + 1; job.source = undefined; }
      const directoryId = job.attempt ? `${job.id}-attempt-${job.attempt}` : job.id;
      const directory = path.join(base, this.directory, 'paper-reading-runtime', directoryId);
      const skillDirectory = path.join(directory, '.agents', 'skills', 'write-obsidian-paper-notes');
      await fs.mkdir(directory, { recursive: true });
      const settings = { ...normalizeReadingSettings(this.plugin.settings.paperReading), ...job.choice };
      if (!job.result) {
        const pythonExecutable = await checkCropRuntime(controller.signal);
        await copySkill(skillDirectory);
        if (!job.source || !await fs.access(path.join(directory, 'source-text.json')).then(() => true, () => false)) {
          job.source = await preparePaperSource(job.paper, directory, controller.signal, progress);
          await this.persist();
        }
        const samples = await collectStyleSamples(vault, file, this.plugin.settings.workspaceFolder);
        await fs.writeFile(path.join(directory, 'style-samples.json'), JSON.stringify(samples, null, 2));
        await fs.writeFile(path.join(directory, 'task.json'), JSON.stringify({ target: job.path, paper: job.paper,
          classificationConfirmed: !!job.paper.field || !!job.paper.fields?.length, pythonExecutable,
          readingState: '保持用户已确认的现有阅读分类，不因生成笔记而改变', sourceUrl: job.source.url }, null, 2));
        job.result = await runReadingSkill(settings, directory, path.join(skillDirectory, 'SKILL.md'), controller.signal, progress);
        job.threadId = job.result.threadId;
        await this.persist();
      }
      if (!job.source) throw new Error('缺少原文核查材料');
      if (!job.source.pageTexts) {
        const stored = JSON.parse(await fs.readFile(path.join(directory, 'source-text.json'), 'utf8'));
        const pageTexts: string[] | undefined = Array.isArray(stored.pages) ? stored.pages.map((page: { text: string }) => page.text) : undefined;
        if (pageTexts && pageTexts.join('\n\n') !== job.source.text) throw new Error('原文页面与保存记录不一致，草稿已保留，未写入');
        if (pageTexts) job.source.pageTexts = pageTexts;
      }
      progress('检查正文、图注、公式与全部图片');
      let verified = new Map<string, Uint8Array>();
      job.result = await reviewReadingResult(job, job.source, {
        inspectAssets: async result => { const inspected = await inspectReadingAssets(directory, result); verified = inspected.files; return inspected.issues; },
        preserve: async (result, issues) => {
          await writeTaskJson(directory, 'rejected-result.json', result);
          await writeTaskJson(directory, 'validation-issues.json', issues);
          await this.persist();
        },
        revise: async (result, issues) => {
          await writeTaskJson(directory, 'recovery-input.json', { issues, result,
            instruction: '修复可核查的问题；分图总 caption 与面板标签可以分开核对。不要以相近句子或猜测替代证据。' });
          const remaining = settings.timeoutMinutes - (Date.now() - job.startedAt!) / 60_000;
          if (remaining <= 0) throw new Error('论文阅读超时，草稿与图片已保留');
          return runReadingSkill({ ...settings, timeoutMinutes: remaining }, directory, path.join(skillDirectory, 'SKILL.md'), controller.signal, progress, true);
        },
        persist: () => this.persist(), progress,
      });
      await writeTaskJson(directory, 'validated-result.json', job.result);
      const paths = new Map<string, string>();
      for (const asset of job.result.assets) {
        const data = verified.get(asset.id)!;
        const name = path.basename(asset.path);
        const relative = `${this.plugin.settings.workspaceFolder}/AI论文图片/${job.id}/${name}`;
        await fs.mkdir(path.join(base, this.plugin.settings.workspaceFolder, 'AI论文图片', job.id), { recursive: true });
        // Obsidian's adapter emits filesystem changes while preserving the asset bytes.
        await vault.adapter.writeBinary(relative, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
        paths.set(asset.id, relative);
      }
      if (this.disposed || controller.signal.aborted || job.deleted) throw new Error('任务已取消');
      if (vault.getAbstractFileByPath(file.path) !== file) throw new Error('论文已删除或被替换，未写入');
      const generated = renderReadingNote(job.result, paths);
      if (!job.writeBaseHash) { job.writeBaseHash = noteHash(await vault.read(file)); await this.persist(); }
      progress('写入并回读核对');
      await vault.process(file, content => appendReadingNote(content, generated, job.writeBaseHash));
      if (!(await vault.read(file)).includes(generated)) throw new Error('正文回读校验失败，结果已保留');
      for (const relative of paths.values()) if (!await vault.adapter.exists(relative)) throw new Error('图片回读校验失败');
      job.written = generated; job.status = 'completed'; job.phase = '阅读笔记已完成'; job.error = undefined;
      job.result = undefined; job.source = undefined; await this.persist();
      new Notice(`论文阅读笔记已完成：${job.paper.title}`);
    } catch (error) {
      if (this.disposed) return;
      if (job.deleted || controller.signal.aborted) { job.status = 'cancelled'; job.phase = '已取消'; }
      else { job.status = 'failed'; job.error = this.message(error); job.phase = '未完成，可重试'; }
      await this.persist().catch(() => {});
      if (job.error) new Notice(`论文阅读未完成：${job.error}`, 10_000);
    } finally { clearInterval(tick); this.active = undefined; this.activeJob = undefined; this.notify(); }
  }
  private message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
}
