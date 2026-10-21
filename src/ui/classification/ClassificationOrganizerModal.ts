import { App, Modal, Notice } from 'obsidian';
import type MyPlugin from '../../main';
import type { ClassificationBackupEntry, ClassificationPaper, ClassificationResult } from '../../classification/storage';
import { applyClassificationPlan, listClassificationBackups, restoreClassificationBackup, scanClassificationPapers } from '../../classification/storage';
import { createSuggestedTaxonomy, suggestPaperClassification } from '../../classification/suggestions';
import { renderBackupPanel } from './backupPanel';
import { renderDomainEditor } from './domainEditor';
import { renderPaperRows, PaperFilters } from './paperRows';
import { changed, displayFields, labels, OrganizerDraft, preserveUnknownLabels, validateDraft } from './model';

export class ClassificationOrganizerModal extends Modal {
  private draft: OrganizerDraft = { taxonomy: [], defaultField: '', rows: [] };
  private filters: PaperFilters = { query: '', mode: 'all', source: '', page: 0 };
  private papers: ClassificationPaper[] = [];
  private baseline = '';
  private busy = false;
  private active = false;
  private error = '';
  private result: ClassificationResult | null = null;
  private backups?: Promise<ClassificationBackupEntry[]>;

  constructor(app: App, private plugin: MyPlugin, private onChanged?: () => void | Promise<void>) { super(app); }

  onOpen(): void {
    this.active = true;
    this.modalEl.addClass('classification-organizer-modal');
    this.titleEl.setText('整理研究领域与论文分类');
    void this.load();
  }

  onClose(): void { this.active = false; this.contentEl.empty(); }

  private settingsSnapshot(): string {
    return JSON.stringify({ fields: this.plugin.settings.fields, defaultField: this.plugin.settings.defaultField });
  }

  private async load(): Promise<void> {
    this.busy = true;
    this.contentEl.empty(); this.contentEl.createEl('p', { text: '正在读取论文分类…' });
    try {
      this.papers = await scanClassificationPapers(this.plugin);
      this.baseline = this.settingsSnapshot();
      this.resetDraft(false);
      this.error = '';
      if (this.active) this.backups = listClassificationBackups(this.plugin);
    } catch (error) { this.error = this.errorText(error); }
    finally { this.busy = false; if (this.active) this.render(); }
  }

  private resetDraft(suggest: boolean): void {
    const current = this.plugin.settings.fields.map(field => ({ ...field, ...(field.aliases ? { aliases: [...field.aliases] } : {}) }));
    const taxonomy = suggest ? createSuggestedTaxonomy(current) : current;
    this.draft = {
      taxonomy,
      defaultField: taxonomy.find(field => field.name === this.plugin.settings.defaultField || field.aliases?.includes(this.plugin.settings.defaultField))?.name || taxonomy[0]?.name || '',
      rows: this.papers.map(paper => {
        const suggestion = suggest ? suggestPaperClassification(paper, taxonomy) : { fields: [...paper.fields], reason: '保留当前分类；可生成建议或手动点选', confidence: 'low' as const };
        return { paper, ...suggestion, selected: suggest && suggestion.confidence !== 'low' && JSON.stringify(suggestion.fields) !== JSON.stringify(paper.fields) };
      }),
    };
    preserveUnknownLabels(this.draft);
    this.filters.page = 0;
  }

  private render(): void {
    if (!this.active) return;
    const opened = new Set(Array.from(this.contentEl.querySelectorAll<HTMLDetailsElement>('details[open][data-section]')).map(element => element.dataset.section));
    const scroll = this.contentEl.scrollTop;
    this.contentEl.empty();
    const body = this.contentEl.createDiv({ cls: 'classification-organizer' });
    body.createEl('p', { cls: 'classification-intro', text: '按您的论文研究任务梳理主领域，并用细分标签标出方法、输入和训练方式。本地读取标题、摘要和已有标签生成建议；证据不足的论文保留待确认。勾选并应用前会自动备份。' });
    const known = new Set(labels(this.plugin.settings.fields));
    const unclassified = this.papers.filter(paper => !paper.fields.length).length;
    const unknown = this.papers.filter(paper => paper.fields.some(label => !known.has(label))).length;
    body.createDiv({ cls: 'classification-stats', text: `${this.papers.length} 篇论文 · ${this.plugin.settings.fields.length} 个主领域 · ${unclassified} 篇未分类 · ${unknown} 篇含未定义标签` });
    const actions = body.createDiv({ cls: 'classification-actions' });
    this.button(actions, '保留现有结构', () => { this.resetDraft(false); this.render(); });
    this.button(actions, '生成整理建议', () => { this.resetDraft(true); this.render(); }, 'mod-cta');
    this.button(actions, '重新读取论文', () => { void this.load(); });
    body.createEl('p', { cls: 'setting-item-description', text: '生成建议只改变草稿。中、高把握的变更会预先勾选；低把握的建议需要您确认。第一项是主领域，后面可保留多个细分标签。重新生成或读取会重置未应用的草稿。' });
    if (this.error) body.createDiv({ cls: 'classification-error', text: this.error });
    if (this.result) this.renderResult(body, this.result);
    const refresh = () => this.render();
    renderDomainEditor(body, this.draft, refresh);
    renderPaperRows(body, this.draft, this.filters, refresh);
    this.renderApply(body);
    void renderBackupPanel(body, this.plugin, path => this.restore(path), this.backups);
    this.contentEl.querySelectorAll<HTMLDetailsElement>('details[data-section]').forEach(element => { element.open = opened.has(element.dataset.section); });
    this.contentEl.scrollTop = scroll;
    if (this.busy) body.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('input,button,select,textarea').forEach(control => { control.disabled = true; });
  }

  private renderApply(container: HTMLElement): void {
    const changes = this.draft.rows.filter(row => row.selected && changed(row));
    const taxonomyChanged = JSON.stringify(this.draft.taxonomy) !== JSON.stringify(this.plugin.settings.fields) || this.draft.defaultField !== this.plugin.settings.defaultField;
    const panel = container.createDiv({ cls: 'classification-apply' });
    panel.createEl('h3', { text: `待应用：${changes.length} 篇论文${taxonomyChanged ? '，以及领域结构' : ''}` });
    const preview = panel.createEl('details', { attr: { 'data-section': 'preview' } });
    preview.createEl('summary', { text: '查看具体改动' });
    const list = preview.createDiv({ cls: 'classification-change-list' });
    if (taxonomyChanged) list.createEl('p', { text: `保存 ${this.draft.taxonomy.length} 个主领域、${this.draft.taxonomy.reduce((count, field) => count + (field.aliases?.length || 0), 0)} 个子领域；默认主领域：${this.draft.defaultField}` });
    changes.forEach(row => {
      const change = list.createDiv({ cls: 'classification-change' });
      change.createEl('strong', { text: row.paper.title });
      change.createDiv({ text: `${displayFields(row.paper.fields)} → ${displayFields(row.fields)}` });
    });
    if (!changes.length && !taxonomyChanged) list.createEl('p', { text: '当前没有需要保存的改动。' });
    const issue = validateDraft(this.draft);
    if (issue) panel.createDiv({ cls: 'classification-error', text: issue });
    const button = this.button(panel, this.busy ? '正在备份并处理…' : `备份并应用 ${changes.length} 篇`, () => { void this.apply(); }, 'mod-cta');
    button.disabled = this.busy || Boolean(issue) || (!changes.length && !taxonomyChanged);
  }

  private async apply(): Promise<void> {
    if (this.busy) return;
    const issue = validateDraft(this.draft);
    if (issue) { this.error = issue; this.render(); return; }
    if (this.settingsSnapshot() !== this.baseline) {
      this.error = '领域设置在整理期间发生变化。请点击“重新读取论文”后再整理，避免覆盖新的设置。';
      this.render(); return;
    }
    this.busy = true; this.error = ''; this.render();
    try {
      this.result = await applyClassificationPlan(this.plugin, this.papers, {
        taxonomy: this.draft.taxonomy,
        defaultField: this.draft.defaultField,
        changes: this.draft.rows.filter(row => row.selected && changed(row)).map(row => ({ path: row.paper.path, beforeFields: row.paper.fields, afterFields: row.fields })),
      });
      new Notice(`分类处理完成：更新 ${this.result.updated.length} 篇，跳过 ${this.result.skipped.length} 篇，失败 ${this.result.failed.length} 项`);
      await this.onChanged?.();
      await this.load();
    } catch (error) { this.error = this.errorText(error); }
    finally { this.busy = false; this.render(); }
  }

  private async restore(path: string): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.render();
    try {
      this.result = await restoreClassificationBackup(this.plugin, path);
      new Notice(`恢复处理完成：更新 ${this.result.updated.length} 篇，跳过 ${this.result.skipped.length} 篇，失败 ${this.result.failed.length} 项`);
      await this.onChanged?.();
      await this.load();
    } catch (error) { this.error = this.errorText(error); }
    finally { this.busy = false; this.render(); }
  }

  private renderResult(container: HTMLElement, result: ClassificationResult): void {
    const panel = container.createDiv({ cls: 'classification-result' });
    panel.createDiv({ text: `已更新 ${result.updated.length} 篇 · 跳过 ${result.skipped.length} 篇 · 失败 ${result.failed.length} 项` });
    panel.createDiv({ cls: 'classification-backup-path', text: `操作前备份：${result.backupPath}` });
    for (const [prefix, entries] of [['跳过', result.skipped], ['失败', result.failed]] as const) {
      entries.forEach(entry => panel.createDiv({ cls: 'classification-error', text: `${prefix} ${entry.path}：${entry.reason}` }));
    }
  }

  private button(container: HTMLElement, text: string, click: () => void, cls = ''): HTMLButtonElement {
    const button = container.createEl('button', { text, cls });
    button.addEventListener('click', click);
    return button;
  }

  private errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
}
