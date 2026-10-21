import { App, Modal } from 'obsidian';
import type MyPlugin from '../../main';
import { listClassificationBackups } from '../../classification/storage';
import type { ClassificationBackupEntry } from '../../classification/storage';

export async function renderBackupPanel(container: HTMLElement, plugin: MyPlugin, restore: (path: string) => Promise<void>, cached?: Promise<ClassificationBackupEntry[]>): Promise<void> {
  const details = container.createEl('details', { cls: 'classification-backups', attr: { 'data-section': 'backups' } });
  details.createEl('summary', { text: '分类备份与恢复' });
  const body = details.createDiv();
  body.createEl('p', { cls: 'setting-item-description', text: '每次应用和恢复之前都会自动备份。恢复只还原分类与领域设置，不替换论文正文。' });
  try {
    const backups = await (cached || listClassificationBackups(plugin));
    if (!body.isConnected) return;
    if (!backups.length) { body.createEl('p', { text: '暂无分类备份；第一次应用时会自动创建。' }); return; }
    const selection = body.createEl('select', { attr: { 'aria-label': '选择分类备份' } });
    backups.forEach(backup => selection.createEl('option', { value: backup.path, text: `${new Date(backup.createdAt).toLocaleString()} · ${backup.count} 篇` }));
    const path = body.createDiv({ cls: 'classification-backup-path', text: selection.value });
    selection.addEventListener('change', () => { path.textContent = selection.value; });
    body.createEl('button', { text: '恢复此备份…' }).addEventListener('click', () => {
      const entry = backups.find(backup => backup.path === selection.value);
      if (!entry) return;
      new ConfirmRestoreModal(plugin.app, entry.path, entry.count, restore).open();
    });
  } catch (error) {
    body.createDiv({ cls: 'classification-error', text: `读取备份失败：${error instanceof Error ? error.message : String(error)}` });
  }
}

class ConfirmRestoreModal extends Modal {
  constructor(app: App, private path: string, private count: number, private restore: (path: string) => Promise<void>) { super(app); }
  onOpen(): void {
    this.titleEl.setText('确认恢复分类');
    this.contentEl.createEl('p', { text: `将尝试恢复备份中 ${this.count} 篇论文的分类及领域结构。当前分类会先另存为新备份。打开的整理草稿将被刷新。` });
    this.contentEl.createEl('p', { cls: 'classification-backup-path', text: this.path });
    const actions = this.contentEl.createDiv({ cls: 'classification-actions' });
    actions.createEl('button', { text: '取消' }).addEventListener('click', () => this.close());
    actions.createEl('button', { text: '备份当前分类并恢复', cls: 'mod-warning' }).addEventListener('click', () => { this.close(); void this.restore(this.path); });
  }
  onClose(): void { this.contentEl.empty(); }
}
