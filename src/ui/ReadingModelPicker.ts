import { ButtonComponent, DropdownComponent, FileSystemAdapter, Platform, Setting } from 'obsidian';
import type PaperPlugin from '../main';
import type { ReadingSettings } from '../reading/config';
import { resolveCodexExecutable } from '../reading/config';
import { readModelCatalog, type MentorModel } from '../reading/modelCatalog';

const catalogCache = new Map<string, MentorModel[]>();
export function renderReadingModelPicker(container: HTMLElement, plugin: PaperPlugin,
  choice: Pick<ReadingSettings, 'model' | 'effort'>): () => void {
  const connection = { ...plugin.settings.paperReading, executable: Platform.isDesktopApp ? resolveCodexExecutable(plugin.settings.paperReading.executable) : plugin.settings.paperReading.executable };
  const key = `${connection.executable}\n${connection.proxyUrl}`;
  let models = catalogCache.get(key) || [], disposed = false, controller: AbortController | undefined;
  const setting = new Setting(container).setName('阅读模型').setDesc('添加后按论文阅读 Skill 整理全文；使用所选模型并消耗账号额度。');
  setting.settingEl.addClass('pm-reading-model-setting');
  const row = setting.controlEl.createDiv({ cls: 'pm-reading-model-controls' });
  const model = new DropdownComponent(row), effort = new DropdownComponent(row);
  model.selectEl.setAttribute('aria-label', '阅读模型'); effort.selectEl.setAttribute('aria-label', '推理强度');
  const refresh = new ButtonComponent(row).setIcon('refresh-cw').setTooltip('刷新可用模型');
  const status = setting.controlEl.createDiv({ cls: 'pm-reading-model-status', attr: { role: 'status' } });
  const render = () => {
    model.selectEl.empty(); model.addOption('', 'Codex 默认模型');
    models.forEach(m => model.addOption(m.model, m.displayName));
    if (choice.model && !models.some(m => m.model === choice.model)) model.addOption(choice.model, `${choice.model}（上次选择）`);
    model.setValue(choice.model).setDisabled(!Platform.isDesktopApp || !!controller);
    const selected = models.find(m => m.model === choice.model);
    effort.selectEl.empty(); effort.addOption('', '默认强度');
    selected?.efforts.forEach(e => effort.addOption(e.value, e.value));
    if (choice.effort && !selected) effort.addOption(choice.effort, choice.effort);
    effort.setValue(choice.effort).setDisabled(!Platform.isDesktopApp || !!controller || !selected);
    refresh.setDisabled(!Platform.isDesktopApp || !!controller);
  };
  model.onChange(value => {
    choice.model = value;
    if (!models.find(m => m.model === value)?.efforts.some(e => e.value === choice.effort)) choice.effort = '';
    render();
  });
  effort.onChange(value => { choice.effort = value; });
  const load = async () => {
    if (disposed || controller) return;
    const adapter = plugin.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) { status.setText('论文阅读 Skill 仅支持桌面端'); return; }
    controller = new AbortController(); status.setText('正在读取可用模型…'); render();
    try {
      models = await readModelCatalog(connection, adapter.getBasePath(), controller.signal);
      catalogCache.set(key, models);
      if (!disposed) status.setText('模型选择会随本篇任务保存。');
    } catch (error) { if (!disposed) status.setText(error instanceof Error ? error.message : '暂时无法读取模型，已保留上次选择'); }
    finally { controller = undefined; if (!disposed) render(); }
  };
  refresh.onClick(load); render();
  if (!Platform.isDesktopApp) status.setText('AI 阅读需要桌面端，移动端可添加和管理论文。');
  else if (!models.length) void load(); else status.setText('模型选择会随本篇任务保存。');
  return () => { disposed = true; controller?.abort(); };
}
