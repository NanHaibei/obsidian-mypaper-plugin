import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, MyPluginSettings, PaperSettingTab } from './settings';
import { PAPER_VIEW_TYPE, PaperView } from './ui/PaperView';
import { SetupModal } from './ui/SetupModal';
import { ClassificationOrganizerModal } from './ui/classification/ClassificationOrganizerModal';
import { PaperReading } from './reading/service';
import { normalizeReadingSettings } from './reading/config';

export default class PaperPlugin extends Plugin {
  settings: MyPluginSettings;
  paperReading: PaperReading;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.paperReading = new PaperReading(this);

    this.registerView(PAPER_VIEW_TYPE, leaf => new PaperView(leaf, this));

    this.addRibbonIcon('book-open', '论文管理', () => this.openPaperView());

    this.addCommand({
      id: 'open-paper-manager',
      name: '打开论文管理界面',
      callback: () => this.openPaperView(),
    });

    this.addCommand({
      id: 'organize-paper-classifications',
      name: '整理论文领域与分类',
      callback: () => new ClassificationOrganizerModal(this.app, this, async () => {
        await Promise.allSettled(this.app.workspace.getLeavesOfType(PAPER_VIEW_TYPE)
          .map(leaf => (leaf.view as PaperView).render()));
      }).open(),
    });

    this.addSettingTab(new PaperSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (!this.settings.workspaceFolder) {
        new SetupModal(this.app, this, () => this.openPaperView()).open();
      }
    });
  }

  onunload(): void {}

  async openPaperView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(PAPER_VIEW_TYPE);
    if (existing.length > 0 && existing[0]) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf(false);
    await leaf.setViewState({ type: PAPER_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<MyPluginSettings> & { paperMentor?: any } | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.settings.paperReading = normalizeReadingSettings(data?.paperReading ?? { executable: data?.paperMentor?.executable, proxyUrl: data?.paperMentor?.proxyUrl, model: data?.paperMentor?.model, effort: data?.paperMentor?.effort });

    delete (this.settings as MyPluginSettings & { paperMentor?: unknown }).paperMentor;

    // 确保所有领域都有字体属性（数据迁移）
    this.settings.fields = this.settings.fields.map(field => ({
      ...field,
      titleFontSize: field.titleFontSize ?? 14,
      titleFontFamily: field.titleFontFamily ?? 1,
      metaFontSize: field.metaFontSize ?? 11,
      metaFontFamily: field.metaFontFamily ?? 1,
    }));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private createIdeaId(): string {
    return `idea-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  async addIdea(title: string, content: string, options?: { field?: string; color?: string; isCustomTag?: boolean }): Promise<void> {
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();
    if (!normalizedTitle || !normalizedContent) return;

    this.settings.ideas = this.settings.ideas || [];
    this.settings.ideas.unshift({
      id: this.createIdeaId(),
      title: normalizedTitle,
      content: normalizedContent,
      createdAt: new Date().toISOString(),
      field: options?.field,
      color: options?.color,
      isCustomTag: options?.isCustomTag,
    });
    await this.saveSettings();
  }

  async removeIdea(ideaId: string): Promise<void> {
    this.settings.ideas = (this.settings.ideas || []).filter(idea => idea.id !== ideaId);
    await this.saveSettings();
  }

  async moveIdeaToValhalla(ideaId: string): Promise<void> {
    const idea = (this.settings.ideas || []).find(i => i.id === ideaId);
    if (idea) {
      idea.inValhalla = true;
      await this.saveSettings();
    }
  }

  async removeIdeaFromValhalla(ideaId: string): Promise<void> {
    const idea = (this.settings.ideas || []).find(i => i.id === ideaId);
    if (idea) {
      idea.inValhalla = false;
      await this.saveSettings();
    }
  }
}
