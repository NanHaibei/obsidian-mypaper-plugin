import { readingStatusText } from '../reading/status';
import { App, ItemView, MarkdownRenderer, Menu, Modal, Notice, Setting, TFile, WorkspaceLeaf } from 'obsidian';
import MyPlugin from '../main';
import { getPapersByCategory, movePaper, resolveExcalidrawPath } from '../utils/fileUtils';
import { insertPaperToExcalidraw } from '../utils/excalidrawUtils';
import { getFieldStyle } from '../utils/excalidrawUtils';
import { PaperInfo, IdeaItem } from '../types';
import { AddPaperModal } from './AddPaperModal';
import { renderPaletteSwatches } from './PalettePicker';
import { FieldHoverPreview } from './FieldHoverPreview';
import { SetupModal } from './SetupModal';
import { ClassificationOrganizerModal } from './classification/ClassificationOrganizerModal';
import { applyClassificationPlan, scanClassificationPapers } from '../classification/storage';
import { getMainPaperField, getPrimaryPaperField, normalizePaperFields, resolveMainFieldName } from '../utils/paperFields';
import { getPrimaryFieldGroups } from '../utils/paperFieldStats';

export const PAPER_VIEW_TYPE = 'paper-plugin-view';

// 排序选项类型
export type SortOption = 'date' | 'field' | 'title';

// 排序选项标签
export const SORT_LABELS: Record<SortOption, string> = {
  'date': '添加日期',
  'field': '大领域',
  'title': '标题 A-Z',
};

// 排序选项图标
export const SORT_ICONS: Record<SortOption, string> = {
  'date': '📅',
  'field': '🏷️',
  'title': '🔤',
};

// 删除确认对话框
class DeleteConfirmModal extends Modal {
  onConfirm: () => void;

  constructor(app: any, paperTitle: string, onConfirm: () => void) {
    super(app);
    this.onConfirm = onConfirm;

    this.contentEl.createEl('h2', { text: '确认删除' });
    this.contentEl.createEl('p', {
      text: `确定要删除论文笔记「${paperTitle}」吗？此操作不可撤销。`
    });

    const buttonContainer = this.contentEl.createDiv({
      cls: 'modal-button-container',
    });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '20px';

    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.addEventListener('click', () => this.close());

    const confirmBtn = buttonContainer.createEl('button', {
      text: '确认删除',
      cls: 'mod-warning',
    });
    confirmBtn.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });
  }
}

// 领域论文列表 Modal
class FieldPapersModal extends Modal {
  private fieldName: string;
  private papers: TFile[];
  private plugin: MyPlugin;
  private showExactTagMatches: boolean;

  constructor(app: App, plugin: MyPlugin, fieldName: string, papers: TFile[], showExactTagMatches = false) {
    super(app);
    this.plugin = plugin;
    this.fieldName = fieldName;
    this.papers = papers;
    this.showExactTagMatches = showExactTagMatches;
  }

  onOpen() {
    const { contentEl } = this;
    const fieldStyle = this.plugin.settings.fields.find(f => f.name === this.fieldName);
    
    // 主容器
    const container = contentEl.createDiv({ cls: 'pm-field-papers-container' });
    
    // 简洁标题
    const header = container.createDiv({ cls: 'pm-field-papers-header-simple' });
    header.createEl('h2', { text: this.fieldName });
    header.createSpan({ cls: 'pm-field-papers-count', text: `${this.papers.length} 篇` });
    
    // 显示关联子标签
    if (!this.showExactTagMatches && fieldStyle?.aliases && fieldStyle.aliases.length > 0) {
      const aliasesRow = container.createDiv({ cls: 'pm-field-papers-aliases' });
      aliasesRow.createSpan({ text: '子领域：', cls: 'pm-aliases-label' });
      for (const alias of fieldStyle.aliases) {
        const aliasTag = aliasesRow.createSpan({ cls: 'pm-alias-tag' });
        aliasTag.textContent = alias;
        const aliasCount = this.papers.filter(f => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return normalizePaperFields(fm, this.plugin.settings.defaultField).includes(alias);
        }).length;
        if (aliasCount > 0) {
          aliasTag.createSpan({ cls: 'pm-alias-count', text: ` ${aliasCount}` });
        }
        if (aliasCount > 0) {
          aliasTag.addEventListener('click', () => {
            const exactMatchedPapers = this.papers
              .filter(file => {
                const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
                return normalizePaperFields(fm, this.plugin.settings.defaultField).includes(alias);
              })
              .sort((a, b) => b.stat.mtime - a.stat.mtime);
            this.close();
            new FieldPapersModal(this.app, this.plugin, alias, exactMatchedPapers, true).open();
          });
        }
      }
    }
    
    // 论文列表
    const list = container.createDiv({ cls: 'pm-field-papers-list' });
    
    for (const file of this.papers) {
      this.renderPaperItem(list, file);
    }
  }
  
  private renderPaperItem(list: HTMLElement, file: TFile): void {
    const item = list.createDiv({ cls: 'pm-field-paper-item' });
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    
    // 获取该论文的领域
    const paperFields = normalizePaperFields(fm, this.plugin.settings.defaultField);
    const primaryField = paperFields[0] || this.plugin.settings.defaultField;
    const fieldStyle = getFieldStyle(this.plugin.settings, primaryField);
    
    // 左边框颜色
    if (fieldStyle) {
      item.style.borderLeft = `3px solid ${fieldStyle.backgroundColor}`;
    }
    
    // 内容容器
    const content = item.createDiv({ cls: 'pm-field-paper-content' });
    
    // 标题行
    const titleRow = content.createDiv({ cls: 'pm-field-paper-title-row' });
    const displayName = file.basename.replace(/^【.+?】-/, '');
    titleRow.createSpan({ cls: 'pm-field-paper-title', text: displayName });
    
    // 子领域标签（如果与主领域不同，显示具体子领域）
    const tagContainer = titleRow.createDiv({ cls: 'pm-inline-field-tags' });
    for (const paperField of paperFields) {
      const subFieldTag = tagContainer.createSpan({ cls: 'pm-subfield-tag' });
      subFieldTag.textContent = paperField;
      const subFieldStyle = getFieldStyle(this.plugin.settings, paperField);
      if (subFieldStyle) {
        subFieldTag.style.backgroundColor = subFieldStyle.backgroundColor;
        subFieldTag.style.color = this.getContrastColor(subFieldStyle.backgroundColor);
      }
    }
    
    // 元信息行
    const metaRow = content.createDiv({ cls: 'pm-field-paper-meta' });
    const metaParts: string[] = [];
    if (fm?.date) metaParts.push(fm.date);
    if (fm?.journal) metaParts.push(fm.journal);
    if (fm?.authors) {
      const authors = Array.isArray(fm.authors) ? fm.authors[0] : fm.authors.split(',')[0];
      metaParts.push(authors);
    }
    metaRow.textContent = metaParts.join(' · ');
    
    // 点击打开
    item.addEventListener('click', async () => {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      this.close();
    });
  }
  
  private getContrastColor(hexColor: string): string {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class PaperView extends ItemView {
  plugin: MyPlugin;
  private calendarDisplayYear: number | null = null;
  private calendarDisplayMonth: number | null = null;
  // 每个分类的排序状态
  private categorySortOptions: Map<string, SortOption> = new Map();
  private activeSearchCategory: string | null = null;
  private categorySearchQueries: Map<string, string> = new Map();
  private categorySearchRenders: Map<string, () => void> = new Map();
  private categorySearchWraps: Map<string, HTMLElement> = new Map();
  private categorySearchInputs: Map<string, HTMLInputElement> = new Map();
  private fieldHoverPreview: FieldHoverPreview;

  private getPaperFields(frontmatter: Record<string, unknown> | undefined): string[] {
    return normalizePaperFields(frontmatter, this.plugin.settings.defaultField);
  }

  private getDisplayFieldNames(fieldNames: string[]): string[] {
    if (!fieldNames.length) return [];
    const main = getMainPaperField(this.plugin.settings, { fields: fieldNames });
    return [main, ...fieldNames.filter(name => name !== main)];
  }

  private createFieldTags(
    container: HTMLElement,
    fieldNames: string[],
    maxFieldWidth?: number,
    className = 'pm-field-tag'
  ): void {
    if (fieldNames.length === 0) {
      return;
    }

    fieldNames = this.getDisplayFieldNames(fieldNames);
    const tagRow = container.createDiv({ cls: 'pm-field-tag-row' });
    const primaryFieldName = fieldNames[0]!;
    const primaryFieldStyle = getFieldStyle(this.plugin.settings, primaryFieldName);
    const primaryTag = tagRow.createSpan({ cls: className });
    primaryTag.textContent = primaryFieldName;
    if (typeof maxFieldWidth === 'number') {
      primaryTag.style.minWidth = `${maxFieldWidth}px`;
    }
    primaryTag.style.textAlign = 'center';
    if (primaryFieldStyle) {
      primaryTag.style.backgroundColor = primaryFieldStyle.backgroundColor;
      primaryTag.style.color = this.getContrastColor(primaryFieldStyle.backgroundColor);
    }
    this.fieldHoverPreview.add(primaryTag, fieldNames.map(name => {
      const style = getFieldStyle(this.plugin.settings, name);
      return { name, background: style?.backgroundColor,
        color: style ? this.getContrastColor(style.backgroundColor) : undefined };
    }));

    if (fieldNames.length > 1) {
      const extraTags = tagRow.createDiv({ cls: 'pm-field-tag-squares' });
      for (const fieldName of fieldNames.slice(1)) {
        const fieldStyle = getFieldStyle(this.plugin.settings, fieldName);
        const squareSlot = extraTags.createSpan({ cls: 'pm-field-tag-collapsible-slot' });
        const square = squareSlot.createSpan({ cls: 'pm-field-tag-collapsible' });
        const squareLabel = square.createSpan({ cls: 'pm-field-tag-collapsible-label' });
        squareLabel.textContent = fieldName;
        if (fieldStyle) {
          square.style.backgroundColor = fieldStyle.backgroundColor;
          square.style.borderColor = fieldStyle.backgroundColor;
          square.style.color = this.getContrastColor(fieldStyle.backgroundColor);
        }
      }
    }
  }

  private getIdeaHeatmapColor(count: number, maxCount: number): string {
    if (count <= 0 || maxCount <= 0) return 'var(--background-secondary)';
    if (maxCount === 1) return 'rgb(90, 170, 255)';

    const stops = [
      { at: 0, color: { r: 90, g: 170, b: 255 } },
      { at: 0.35, color: { r: 120, g: 205, b: 255 } },
      { at: 0.6, color: { r: 186, g: 145, b: 255 } },
      { at: 0.8, color: { r: 255, g: 150, b: 210 } },
      { at: 1, color: { r: 255, g: 92, b: 92 } },
    ];

    const ratio = Math.max(0, Math.min(1, (count - 1) / (maxCount - 1)));

    let left = stops[0]!;
    let right = stops[stops.length - 1]!;
    for (let i = 0; i < stops.length - 1; i++) {
      const current = stops[i]!;
      const next = stops[i + 1]!;
      if (ratio >= current.at && ratio <= next.at) {
        left = current;
        right = next;
        break;
      }
    }

    const segmentRatio = right.at === left.at ? 0 : (ratio - left.at) / (right.at - left.at);
    const r = Math.round(left.color.r + (right.color.r - left.color.r) * segmentRatio);
    const g = Math.round(left.color.g + (right.color.g - left.color.g) * segmentRatio);
    const b = Math.round(left.color.b + (right.color.b - left.color.b) * segmentRatio);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private getIdeaHeatmapGradient(maxCount: number): string {
    if (maxCount <= 1) {
      const single = this.getIdeaHeatmapColor(1, 1);
      return `linear-gradient(90deg, ${single} 0%, ${single} 100%)`;
    }

    const samples = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
      const count = 1 + ratio * (maxCount - 1);
      const mappedCount = Math.round(count * 1000) / 1000;
      return this.getIdeaHeatmapColor(mappedCount, maxCount);
    });

    return `linear-gradient(90deg, ${samples[0]} 0%, ${samples[1]} 25%, ${samples[2]} 50%, ${samples[3]} 75%, ${samples[4]} 100%)`;
  }

  constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.fieldHoverPreview = this.addChild(new FieldHoverPreview(this.containerEl.ownerDocument));
    this.register(this.plugin.paperReading.subscribe(() => this.updateReadingStatuses()));
  }

  getViewType(): string {
    return PAPER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '论文管理';
  }

  getIcon(): string {
    return 'book-open';
  }

  async onOpen(): Promise<void> {
    // 添加苹果风格进度条动画样式
    this.addProgressStyles();
    await this.render();
  }

  private addProgressStyles(): void {
    if (document.getElementById('pm-progress-styles')) return;

    const style = document.createElement('style');
    style.id = 'pm-progress-styles';
    style.textContent = `
      @keyframes pm-shimmer {
        0% { transform: translateX(-50%); }
        100% { transform: translateX(50%); }
      }
    `;
    document.head.appendChild(style);
  }

  async render(): Promise<void> {
    this.fieldHoverPreview.close();
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('pm-view');

    if (!this.plugin.settings.workspaceFolder) {
      this.renderSetupPrompt(root);
      return;
    }

    // 创建主容器
    const mainContainer = root.createDiv({ cls: 'pm-main-container' });

    // 左侧区域（论文列表）
    const leftContainer = mainContainer.createDiv({ cls: 'pm-left-container' });
    await this.renderPaperList(leftContainer);

    // 右侧看板
    const rightContainer = mainContainer.createDiv({ cls: 'pm-right-container' });
    this.renderDashboard(rightContainer);
  }

  private renderSetupPrompt(root: HTMLElement): void {
    root.createEl('div', {
      text: '尚未设置工作文件夹',
      cls: 'pm-empty'
    });
    root
      .createEl('button', {
        text: '立即设置',
        cls: 'mod-cta pm-btn-full'
      })
      .addEventListener('click', () => {
        new SetupModal(this.app, this.plugin, () => this.render()).open();
      });
  }

  private async renderPaperList(root: HTMLElement): Promise<void> {
    const byCategory = getPapersByCategory(this.app, this.plugin.settings);
    this.categorySearchRenders.clear();
    this.categorySearchWraps.clear();
    this.categorySearchInputs.clear();

    // 计算最长领域名称的实际像素宽度，用于统一标签宽度
    let maxFieldWidth = 0;
    const measureSpan = document.createElement('span');
    measureSpan.style.fontSize = '11px';
    measureSpan.style.fontWeight = '600';
    measureSpan.style.letterSpacing = '0.05em';
    measureSpan.style.textTransform = 'uppercase';
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.position = 'absolute';
    measureSpan.style.whiteSpace = 'nowrap';
    document.body.appendChild(measureSpan);

    for (const field of this.plugin.settings.fields) {
      const candidateNames = [field.name, ...(field.aliases || [])];
      for (const candidateName of candidateNames) {
        measureSpan.textContent = candidateName.toUpperCase();
        const width = measureSpan.offsetWidth;
        if (width > maxFieldWidth) {
          maxFieldWidth = width;
        }
      }
    }
    document.body.removeChild(measureSpan);

    // 加上 padding (左右各 8px)
    maxFieldWidth += 16;
    // 最小宽度 60px
    maxFieldWidth = Math.max(maxFieldWidth, 60);

    for (const [label, files] of Object.entries(byCategory)) {
      const section = root.createDiv({ cls: 'pm-section' });
      const typedFiles = files as TFile[];
      const maxExtraTagCount = typedFiles.reduce((maxCount, file) => {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const extraCount = Math.max(0, this.getPaperFields(fm).length - 1);
        return Math.max(maxCount, extraCount);
      }, 0);
      const tagColumnWidth = maxFieldWidth + maxExtraTagCount * 16 + (maxExtraTagCount > 0 ? 6 : 0);

      // Section header
      const header = section.createDiv({ cls: 'pm-section-header' });
      header.createSpan({ cls: 'pm-section-title', text: label });

      // 右侧容器：排序按钮 + 数量
      const headerRight = header.createDiv({ cls: 'pm-section-header-right' });

      const searchWrap = headerRight.createDiv({ cls: 'pm-section-search-wrap' });
      const searchBtn = searchWrap.createEl('button', {
        cls: 'pm-search-btn',
        text: '🔍',
        attr: { title: '搜索论文' }
      });

      const searchInput = searchWrap.createEl('input', {
        cls: 'pm-search-input',
        type: 'search',
        attr: { placeholder: '查找论文标题、作者、期刊或领域' }
      });

      const currentQuery = this.categorySearchQueries.get(label) || '';
      const isSearchActive = this.activeSearchCategory === label;
      searchInput.value = currentQuery;
      if (isSearchActive) {
        searchWrap.addClass('is-active');
      }
      this.categorySearchWraps.set(label, searchWrap);
      this.categorySearchInputs.set(label, searchInput);

      const searchPanel = section.createDiv({ cls: 'pm-search-panel' });

      const renderSearchPanel = () => {
        const query = (searchInput.value || '').trim();
        this.categorySearchQueries.set(label, query);
        searchPanel.empty();

        if (this.activeSearchCategory !== label) {
          searchPanel.removeClass('is-open');
          return;
        }

        searchPanel.addClass('is-open');
        searchPanel.createDiv({
          cls: 'pm-search-panel-hint',
          text: query.length > 0 ? `查找“${query}”的匹配论文` : '输入关键词后，下方会显示匹配结果'
        });

        if (query.length === 0) {
          searchPanel.createDiv({
            cls: 'pm-search-panel-empty',
            text: '可搜索标题、作者、期刊和领域'
          });
          return;
        }

        const matchedFiles = this.filterPapersByQuery(typedFiles, query).slice(0, 8);
        if (matchedFiles.length === 0) {
          searchPanel.createDiv({
            cls: 'pm-search-panel-empty',
            text: '没有找到匹配的论文'
          });
          return;
        }

        const results = searchPanel.createDiv({ cls: 'pm-search-panel-results' });
        for (const file of matchedFiles) {
          const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
          const resultItem = results.createDiv({ cls: 'pm-search-panel-item' });
          const title = file.basename.replace(/^【.+?】-/, '');
          resultItem.createDiv({ cls: 'pm-search-panel-title', text: title });

          const metaParts = [
            ...this.getPaperFields(fm),
            typeof fm?.journal === 'string' ? fm.journal : '',
            this.getSearchAuthors(fm)
          ].filter(Boolean);

          if (metaParts.length > 0) {
            resultItem.createDiv({
              cls: 'pm-search-panel-meta',
              text: metaParts.join(' · ')
            });
          }

          resultItem.addEventListener('click', async () => {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
          });
        }
      };
      this.categorySearchRenders.set(label, renderSearchPanel);

      searchBtn.addEventListener('click', () => {
        this.activeSearchCategory = this.activeSearchCategory === label ? null : label;
        this.syncSearchUi(this.activeSearchCategory === label ? label : undefined);
      });

      searchInput.addEventListener('click', (e) => e.stopPropagation());
      searchInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') {
          this.activeSearchCategory = null;
          this.syncSearchUi();
          return;
        }

        if (e.key === 'Enter') {
          const firstMatch = this.filterPapersByQuery(typedFiles, searchInput.value.trim())[0];
          if (!firstMatch) {
            return;
          }
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(firstMatch);
        }
      });
      searchInput.addEventListener('focus', () => {
        this.activeSearchCategory = label;
        this.syncSearchUi();
      });
      searchInput.addEventListener('input', () => renderSearchPanel());

      // 排序按钮
      const currentSort = this.categorySortOptions.get(label) || 'date';
      const sortBtn = headerRight.createEl('button', {
        cls: 'pm-sort-btn',
        text: `${SORT_ICONS[currentSort]}`,
        attr: { title: `排序: ${SORT_LABELS[currentSort]}` }
      });
      sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showSortMenu(e, label);
      });

      headerRight.createSpan({ cls: 'pm-section-count', text: String(files.length) });

      if (files.length === 0) {
        renderSearchPanel();
        section.createDiv({ cls: 'pm-empty', text: '暂无论文' });
        continue;
      }

      // 对文件进行排序
      const sortedFiles = this.sortFiles(typedFiles, currentSort);

      // Paper list
      const list = section.createDiv({ cls: 'pm-paper-list' });
      for (const file of sortedFiles) {
        await this.renderPaperItem(list, file as TFile, label, maxFieldWidth, tagColumnWidth);
      }

      renderSearchPanel();
    }
  }

  private syncSearchUi(focusCategory?: string): void {
    for (const [category, wrap] of this.categorySearchWraps.entries()) {
      if (this.activeSearchCategory === category) {
        wrap.addClass('is-active');
      } else {
        wrap.removeClass('is-active');
      }
    }

    for (const renderSearchPanel of this.categorySearchRenders.values()) {
      renderSearchPanel();
    }

    if (!focusCategory) {
      return;
    }

    const input = this.categorySearchInputs.get(focusCategory);
    if (input) {
      window.setTimeout(() => input.focus(), 0);
    }
  }

  private filterPapersByQuery(files: TFile[], query: string): TFile[] {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    if (!normalizedQuery) {
      return [];
    }

    return files.filter((file) => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const haystacks = [
        file.basename.replace(/^【.+?】-/, ''),
        typeof fm?.title === 'string' ? fm.title : '',
        typeof fm?.journal === 'string' ? fm.journal : '',
        this.getSearchAuthors(fm),
        ...this.getPaperFields(fm)
      ];

      return haystacks.some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery));
    });
  }

  private getSearchAuthors(frontmatter: Record<string, unknown> | undefined): string {
    const authors = frontmatter?.authors;
    if (Array.isArray(authors)) {
      return authors.join(', ');
    }
    return typeof authors === 'string' ? authors : '';
  }

  // 排序文件
  private sortFiles(files: TFile[], sortOption: SortOption): TFile[] {
    const sorted = [...files];

    switch (sortOption) {
      case 'date':
        // 按添加日期（创建时间）降序
        sorted.sort((a, b) => b.stat.ctime - a.stat.ctime);
        break;
      case 'field':
        // 按主领域 A-Z，再按该论文的所有领域标签排序
        sorted.sort((a, b) => {
          const fmA = this.app.metadataCache.getFileCache(a)?.frontmatter;
          const fmB = this.app.metadataCache.getFileCache(b)?.frontmatter;
          const paperFieldsA = this.getPaperFields(fmA);
          const paperFieldsB = this.getPaperFields(fmB);
          const primaryFieldA = paperFieldsA[0] || this.plugin.settings.defaultField;
          const primaryFieldB = paperFieldsB[0] || this.plugin.settings.defaultField;
          const mainFieldA = resolveMainFieldName(this.plugin.settings, primaryFieldA);
          const mainFieldB = resolveMainFieldName(this.plugin.settings, primaryFieldB);

          const mainCompare = mainFieldA.localeCompare(mainFieldB, 'zh-CN');
          if (mainCompare !== 0) {
            return mainCompare;
          }

          return paperFieldsA.join('|').localeCompare(paperFieldsB.join('|'), 'zh-CN');
        });
        break;
      case 'title':
        // 按标题（A-Z）
        sorted.sort((a, b) => {
          const titleA = a.basename.replace(/^【.+?】-/, '').toLowerCase();
          const titleB = b.basename.replace(/^【.+?】-/, '').toLowerCase();
          return titleA.localeCompare(titleB, 'zh-CN');
        });
        break;
    }

    return sorted;
  }

  // 显示排序菜单
  private showSortMenu(e: MouseEvent, category: string): void {
    const menu = new Menu();
    const currentSort = this.categorySortOptions.get(category) || 'date';

    for (const [value, label] of Object.entries(SORT_LABELS)) {
      const sortOption = value as SortOption;
      const icon = SORT_ICONS[sortOption];
      const isActive = currentSort === sortOption;

      menu.addItem(item => {
        item
          .setTitle(`${icon} ${label}${isActive ? ' ✓' : ''}`)
          .onClick(() => {
            this.categorySortOptions.set(category, sortOption);
            this.render();
          });
      });
    }

    menu.showAtMouseEvent(e);
  }

  private readingStatusElements = new Map<string, HTMLElement>();

  private updateReadingStatuses(): void {
    for (const [path, element] of this.readingStatusElements) {
      const job = this.plugin.paperReading.statusFor(path);
      element.setText(job ? readingStatusText(job) : '');
      element.title = job?.error || '';
      element.toggleClass('pm-reading-failed', job?.status === 'failed');
    }
  }

  private async renderPaperItem(
    list: HTMLElement,
    file: TFile,
    category: string,
    maxFieldWidth: number,
    tagColumnWidth?: number
  ): Promise<void> {
    const item = list.createDiv({ cls: 'pm-paper-item' });

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const paperFields = this.getPaperFields(fm);
    const primaryField = getPrimaryPaperField(fm, this.plugin.settings.defaultField);
    const fieldStyle = getFieldStyle(this.plugin.settings, primaryField);
    const defaultField = getFieldStyle(this.plugin.settings, this.plugin.settings.defaultField);
    const activeField = fieldStyle || defaultField;

    // 设置边框色（使用卡片的背景色）
    if (activeField) {
      item.style.borderLeft = `3px solid ${activeField.backgroundColor}`;
    }

    if (this.readingStatusElements.size > 2000) this.readingStatusElements.clear();
    // Display title (remove prefix like "【粗读】-")
    const displayName = file.basename.replace(/^【.+?】-/, '');

    // 创建标题和标签的容器
    const contentContainer = item.createDiv({ cls: 'pm-paper-content' });
    contentContainer.style.display = 'flex';
    contentContainer.style.alignItems = 'center';
    contentContainer.style.justifyContent = 'space-between';
    contentContainer.style.gap = '8px';
    contentContainer.style.flex = '1';
    contentContainer.style.minWidth = '0';

    const titleContainer = contentContainer.createDiv({ cls: 'pm-paper-title-container' });
    titleContainer.style.flex = '1';
    titleContainer.style.minWidth = '0';

    // 使用 MarkdownRenderer 渲染标题（支持公式）
    const titleSpan = titleContainer.createSpan({ cls: 'pm-paper-title' });
    await MarkdownRenderer.render(this.app, displayName, titleSpan, file.path, this);

    const readingStatus = titleContainer.createDiv({ cls: 'pm-reading-status' });
    this.readingStatusElements.set(file.path, readingStatus);
    const job = this.plugin.paperReading.statusFor(file.path);
    if (job) { readingStatus.setText(readingStatusText(job)); readingStatus.title = job.error || ''; readingStatus.toggleClass('pm-reading-failed', job.status === 'failed'); }

    const fieldTagContainer = contentContainer.createDiv({ cls: 'pm-paper-field-tags' });
    if (typeof tagColumnWidth === 'number') {
      fieldTagContainer.style.width = `${tagColumnWidth}px`;
    }
    this.createFieldTags(fieldTagContainer, paperFields, maxFieldWidth);

    // Click to open
    item.addEventListener('click', async (e) => {
      if ((e.target as HTMLElement).closest('.pm-item-menu-btn')) return;
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    });

    // Menu button
    const menuBtn = item.createEl('button', {
      cls: 'pm-item-menu-btn',
      text: '…',
      attr: { title: '更多操作' },
    });
    menuBtn.addEventListener('click', (e) => {
      this.showContextMenu(e, file, displayName, category);
    });
  }

  // 根据背景色获取对比色（黑色或白色）
  private getContrastColor(hexColor: string): string {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  }

  private showContextMenu(e: MouseEvent, file: TFile, displayName: string, currentCategory: string): void {
    e.stopPropagation();
    const menu = new Menu();

    // Move options
    const allCategories = ['待阅读', ...this.plugin.settings.labels];
    for (const targetLabel of allCategories) {
      if (targetLabel === currentCategory) continue;

      menu.addItem(mi =>
        mi.setTitle(`移至「${targetLabel}」`).onClick(async () => {
          try {
            await movePaper(
              this.app,
              this.plugin.settings,
              file,
              targetLabel
            );
            new Notice(`已移至「${targetLabel}」`);
            await this.render();
          } catch (err) {
            new Notice('移动失败：' + (err as Error).message);
          }
        })
      );
    }

    menu.addSeparator();

    // 修改领域
    menu.addItem(mi =>
      mi.setTitle('🏷️ 修改领域').onClick(() => {
        this.showFieldChangeModal(file, displayName);
      })
    );

    menu.addSeparator();

    menu.addItem(mi =>
      mi.setTitle('生成或重试阅读笔记').setIcon('sparkles').onClick(async () => {
        await this.plugin.paperReading.generateForFile(file);
      })
    );

    menu.addSeparator();

    const readingJob = this.plugin.paperReading.statusFor(file.path);
    if (readingJob?.error) menu.addItem(mi => mi.setTitle('查看阅读任务未完成原因').onClick(() => { new Notice(readingJob.error!, 15000); }));
    if (readingJob && ['queued', 'running'].includes(readingJob.status)) {
      menu.addItem(mi => mi.setTitle('取消本篇阅读任务').onClick(() => this.plugin.paperReading.cancel(file.path)));
    }

    // Add to Excalidraw
    menu.addItem(mi =>
      mi.setTitle('添加到 Excalidraw').onClick(async () => {
        await this.addToExcalidraw(file, displayName);
      })
    );

    menu.addSeparator();

    // Delete
    menu.addItem(mi =>
      mi.setTitle('🗑️ 删除').onClick(() => {
        new DeleteConfirmModal(this.app, displayName, async () => {
          try {
            await this.app.vault.delete(file);
            new Notice(`已删除「${displayName}」`);
            await this.render();
          } catch (err) {
            new Notice('删除失败：' + (err as Error).message);
          }
        }).open();
      })
    );

    menu.showAtMouseEvent(e);
  }

  private async addToExcalidraw(file: TFile, displayName: string): Promise<void> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const paperInfo: PaperInfo = {
      title: fm?.title ?? displayName,
      journal: fm?.journal ?? '',
      date: fm?.date ?? '',
      authors: Array.isArray(fm?.authors) ? fm.authors : [],
      institutions: Array.isArray(fm?.institutions) ? fm.institutions : [],
      arxivId: fm?.arxivId,
      doi: fm?.doi,
      field: fm?.field,
      fields: this.getPaperFields(fm),
    };

    try {
      // 手动入口应始终允许添加卡片；设置开关只控制“添加论文时自动创建卡片”。
      await insertPaperToExcalidraw(
        this.app,
        this.plugin.settings,
        paperInfo,
        file
      );
      new Notice(`已添加到 Excalidraw`);

      // Open Excalidraw file (reuse existing tab if possible)
      const excalidrawPath = resolveExcalidrawPath(this.plugin.settings);
      const excalidrawFile = this.app.vault.getAbstractFileByPath(excalidrawPath);

      if (excalidrawFile instanceof TFile) {
        let existingLeaf = null;
        this.app.workspace.iterateAllLeaves((leaf: any) => {
          const view = leaf.view as any;
          if (view.file?.path === excalidrawFile.path) {
            existingLeaf = leaf;
            return true;
          }
          return false;
        });

        if (existingLeaf) {
          this.app.workspace.revealLeaf(existingLeaf);
        } else {
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(excalidrawFile);
        }
      }
    } catch (err) {
      new Notice('添加失败：' + (err as Error).message);
    }
  }

  // ==================== 右侧看板（Apple 风格简化版）====================

  private renderDashboard(container: HTMLElement): void {
    // 快速操作按钮（添加论文 + 刷新）
    this.renderQuickActions(container);

    // 统计
    this.renderFieldStats(container);

    // 阅读进度
    this.renderReadingProgress(container);

    // 灵感管理
    this.renderIdeaActions(container);

    // 英灵殿
    this.renderValhalla(container);

    // 日历
    this.renderCalendar(container);
  }

  private renderQuickActions(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'pm-dashboard-section' });

    const buttonRow = section.createDiv({ cls: 'pm-action-buttons-row' });

    // 添加论文按钮
    const addBtn = buttonRow.createEl('button', {
      cls: 'mod-cta pm-action-button-primary',
      text: '➕ Add Paper'
    });
    addBtn.addEventListener('click', () =>
      new AddPaperModal(this.app, this.plugin, () => this.render()).open()
    );

    // 刷新按钮
    const refreshBtn = buttonRow.createEl('button', {
      cls: 'pm-action-button-secondary',
      text: '🔄 Update'
    });
    refreshBtn.addEventListener('click', () => this.render());

    const organizeBtn = section.createEl('button', {
      cls: 'pm-organize-classifications-button', text: '🏷️ 整理分类',
    });
    organizeBtn.addEventListener('click', () =>
      new ClassificationOrganizerModal(this.app, this.plugin, () => this.render()).open()
    );
  }

  private renderFieldStats(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'pm-dashboard-section' });
    const fieldStats = this.getPrimaryFieldStats();
    const totalPapers = fieldStats.reduce((sum, field) => sum + field.count, 0);

    if (totalPapers === 0) {
      section.createEl('h4', { text: '统计' });
      section.createDiv({ cls: 'pm-empty', text: '暂无论文' });
      return;
    }

    // 创建环形图 - 使用原生 DOM API
    const chartSize = 160;
    const strokeWidth = 20;
    const radius = (chartSize - strokeWidth) / 2;
    const center = chartSize / 2;
    const circumference = 2 * Math.PI * radius;

    const chartContainer = section.createDiv({ cls: 'pm-chart-container' });

    // 创建 SVG 元素
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', String(chartSize));
    svg.setAttribute('height', String(chartSize));
    svg.classList.add('pm-donut-chart');
    chartContainer.appendChild(svg);

    let currentOffset = 0;

    // 绘制环形图片段
    for (const field of fieldStats) {
      const percentage = field.count / totalPapers;
      const dashArray = percentage * circumference;
      const dashOffset = -currentOffset;

      const circle = document.createElementNS(svgNs, 'circle');
      circle.setAttribute('cx', String(center));
      circle.setAttribute('cy', String(center));
      circle.setAttribute('r', String(radius));
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', field.color);
      circle.setAttribute('stroke-width', String(strokeWidth));
      circle.setAttribute('stroke-dasharray', `${dashArray} ${circumference}`);
      circle.setAttribute('stroke-dashoffset', String(dashOffset));
      circle.classList.add('pm-donut-segment');

      // 添加 tooltip
      const title = document.createElementNS(svgNs, 'title');
      title.textContent = `${field.name}: ${field.count}篇 (${Math.round(percentage * 100)}%)`;
      circle.appendChild(title);

      svg.appendChild(circle);
      currentOffset += dashArray;
    }

    // 中心总数文字
    const textGroup = document.createElementNS(svgNs, 'g');
    textGroup.classList.add('pm-donut-center');
    svg.appendChild(textGroup);

    const totalCount = document.createElementNS(svgNs, 'text');
    totalCount.setAttribute('x', String(center));
    totalCount.setAttribute('y', String(center + 8));
    totalCount.setAttribute('text-anchor', 'middle');
    totalCount.classList.add('pm-donut-total');
    totalCount.textContent = String(totalPapers);
    textGroup.appendChild(totalCount);

    const totalLabel = document.createElementNS(svgNs, 'text');
    totalLabel.setAttribute('x', String(center));
    totalLabel.setAttribute('y', String(center + 28));
    totalLabel.setAttribute('text-anchor', 'middle');
    totalLabel.classList.add('pm-donut-label');
    totalLabel.textContent = '论文总数';
    textGroup.appendChild(totalLabel);

    // 图例
    const legend = section.createDiv({ cls: 'pm-chart-legend' });
    for (const field of fieldStats) {
      const percentage = Math.round((field.count / totalPapers) * 100);
      const item = legend.createDiv({ cls: 'pm-legend-item' });
      item.style.cursor = 'pointer';

      // 颜色圆点
      const dotSvg = document.createElementNS(svgNs, 'svg');
      dotSvg.setAttribute('width', '12');
      dotSvg.setAttribute('height', '12');
      dotSvg.classList.add('pm-legend-dot');

      const dot = document.createElementNS(svgNs, 'circle');
      dot.setAttribute('cx', '6');
      dot.setAttribute('cy', '6');
      dot.setAttribute('r', '5');
      dot.setAttribute('fill', field.color);
      dotSvg.appendChild(dot);

      item.appendChild(dotSvg);
      item.createSpan({ cls: 'pm-legend-name', text: field.name });
      item.createSpan({ cls: 'pm-legend-value', text: `${field.count} (${percentage}%)` });
      
      // 点击显示该领域论文列表
      item.addEventListener('click', () => {
        this.showFieldPapers(field.name);
      });
    }
  }

  private renderRecentPapers(container: HTMLElement): void {
    const byCategory = getPapersByCategory(this.app, this.plugin.settings);

    // 收集所有论文并按时间排序
    const allPapers: Array<{ file: TFile; mtime: number }> = [];
    for (const [category, files] of Object.entries(byCategory)) {
      for (const file of files) {
        allPapers.push({
          file: file as TFile,
          mtime: (file as TFile).stat.mtime
        });
      }
    }

    // 按修改时间降序排序，取前5篇
    allPapers.sort((a, b) => b.mtime - a.mtime);
    const recentPapers = allPapers.slice(0, 5);

    if (recentPapers.length === 0) {
      return;
    }

    const section = container.createDiv({ cls: 'pm-dashboard-section' });
    section.createEl('h4', { text: '最近添加' });

    const list = section.createDiv({ cls: 'pm-recent-list' });
    for (const { file, mtime } of recentPapers) {
      const displayName = file.basename.replace(/^【.+?】-/, '');

      const item = list.createDiv({ cls: 'pm-recent-item' });
      item.createSpan({ cls: 'pm-recent-title', text: displayName });

      const timeText = this.formatTimeAgo(mtime);
      item.createSpan({ cls: 'pm-recent-time', text: timeText });

      // 点击打开
      item.addEventListener('click', async () => {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
      });
    }
  }

  private renderReadingProgress(container: HTMLElement): void {
    const byCategory = getPapersByCategory(this.app, this.plugin.settings);

    const unreadCount = (byCategory['待阅读'] || []).length;
    const readCategories = this.plugin.settings.labels;
    const readCount = readCategories.reduce((sum, label) => sum + (byCategory[label]?.length || 0), 0);
    const total = unreadCount + readCount;

    if (total === 0) {
      return;
    }

    const section = container.createDiv({ cls: 'pm-dashboard-section' });

    const readPercent = Math.round((readCount / total) * 100);

    // 标题和百分比（苹果风格）
    const header = section.createDiv({ cls: 'pm-progress-header' });
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '12px';

    const titleText = header.createDiv({ cls: 'pm-progress-title' });
    titleText.textContent = '阅读进度';
    titleText.style.fontSize = '14px';
    titleText.style.fontWeight = '600';
    titleText.style.color = 'var(--text-normal)';

    const percentText = header.createDiv({ cls: 'pm-progress-percent' });
    percentText.textContent = `${readPercent}%`;
    percentText.style.fontSize = '20px';
    percentText.style.fontWeight = '700';
    percentText.style.color = 'var(--interactive-accent)';

    // 数量说明
    const detailText = section.createDiv({ cls: 'pm-progress-detail' });
    detailText.textContent = `已读 ${readCount} 篇，共 ${total} 篇`;
    detailText.style.fontSize = '13px';
    detailText.style.color = 'var(--text-muted)';
    detailText.style.marginBottom = '10px';

    // 苹果风格进度条
    const progressBar = section.createDiv({ cls: 'pm-progress-bar' });
    progressBar.style.width = '100%';
    progressBar.style.height = '8px';
    progressBar.style.backgroundColor = 'var(--background-modifier-border)';
    progressBar.style.borderRadius = '4px';
    progressBar.style.overflow = 'hidden';
    progressBar.style.position = 'relative';

    const progressFill = progressBar.createDiv({ cls: 'pm-progress-fill' });
    progressFill.style.width = `${readPercent}%`;
    progressFill.style.height = '100%';
    progressFill.style.background = 'var(--interactive-accent)';
    progressFill.style.borderRadius = '4px';
    progressFill.style.transition = 'width 0.3s ease';
    progressFill.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
    progressFill.style.position = 'relative';

    // 添加光泽效果（苹果风格）- shimmer 覆盖整个进度条
    const shimmer = progressBar.createDiv();
    shimmer.style.position = 'absolute';
    shimmer.style.top = '0';
    shimmer.style.left = '0';
    shimmer.style.width = '100%';
    shimmer.style.height = '100%';
    shimmer.style.background = 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)';
    shimmer.style.animation = 'pm-shimmer 8s infinite';
    shimmer.style.pointerEvents = 'none';
  }

  private formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    if (days < 30) return `${Math.floor(days / 7)}周前`;
    if (days < 365) return `${Math.floor(days / 30)}月前`;
    return `${Math.floor(days / 365)}年前`;
  }

  // 修改领域模态框
  private showFieldChangeModal(file: TFile, displayName: string): void {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const currentFields = normalizePaperFields(fm);

    const modal = new Modal(this.app);
    modal.contentEl.createEl('h2', { text: '修改论文领域' });

    const desc = modal.contentEl.createDiv();
    desc.textContent = `正在修改论文「${displayName}」的领域`;
    desc.style.marginBottom = '16px';
    desc.style.color = 'var(--text-muted)';

    const fieldOptions: Array<{ value: string; label: string }> = [
      { value: '', label: '未选择' }
    ];
    for (const field of this.plugin.settings.fields) {
      fieldOptions.push({ value: field.name, label: field.name });
      if (field.aliases) {
        for (const alias of field.aliases) {
          fieldOptions.push({ value: alias, label: `${alias} (${field.name})` });
        }
      }
    }

    let nextFields = this.getDisplayFieldNames(this.getPaperFields(fm));
    const fieldSection = modal.contentEl.createDiv({ cls: 'pm-multi-field-section' });
    const fieldHeader = fieldSection.createDiv({ cls: 'pm-multi-field-header' });
    fieldHeader.createDiv({ text: '研究领域', cls: 'pm-multi-field-title' });
    fieldHeader.createDiv({
      text: '支持任意多个标签，第一项作为主领域',
      cls: 'pm-multi-field-desc'
    });

    const fieldList = fieldSection.createDiv({ cls: 'pm-multi-field-list' });
    const fieldActions = fieldSection.createDiv({ cls: 'pm-multi-field-actions' });
    const addFieldBtn = fieldActions.createEl('button', { text: '+ 添加标签' });

    const renderFieldSelectors = () => {
      fieldList.empty();

      nextFields.forEach((selectedField, index) => {
        const row = fieldList.createDiv({ cls: 'pm-multi-field-row' });
        row.createDiv({
          cls: 'pm-multi-field-row-label',
          text: `标签 ${index + 1}${index === 0 ? '（主）' : ''}`
        });

        const controls = row.createDiv({ cls: 'pm-multi-field-row-controls' });
        const select = controls.createEl('select');
        fieldOptions.filter(opt => index > 0 || !opt.value || this.plugin.settings.fields.some(field => field.name === opt.value))
          .forEach(opt => select.createEl('option', { value: opt.value, text: opt.label }));
        select.value = selectedField;
        select.addEventListener('change', () => {
          if (select.value && nextFields.some((value, currentIndex) => currentIndex !== index && value === select.value)) {
            new Notice('领域标签不能重复');
            select.value = selectedField;
            return;
          }

          const updatedFields = [...nextFields];
          updatedFields[index] = select.value;
          nextFields = normalizePaperFields({ fields: updatedFields });
          renderFieldSelectors();
        });

        const removeBtn = controls.createEl('button', { text: '删除' });
        removeBtn.disabled = nextFields.length <= 1;
        removeBtn.addEventListener('click', () => {
          nextFields = nextFields.filter((_, currentIndex) => currentIndex !== index);
          renderFieldSelectors();
        });
      });
    };

    addFieldBtn.addEventListener('click', () => {
      const candidate = fieldOptions.find(opt => opt.value && !nextFields.includes(opt.value));
      if (!candidate) {
        new Notice('没有可新增的领域标签了');
        return;
      }

      nextFields = [...nextFields, candidate.value];
      renderFieldSelectors();
    });

    renderFieldSelectors();

    const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '20px';

    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.addEventListener('click', () => modal.close());

    const confirmBtn = buttonContainer.createEl('button', {
      text: '备份并修改',
      cls: 'mod-cta'
    });

    confirmBtn.addEventListener('click', async () => {
      const normalizedNextFields = this.getDisplayFieldNames(normalizePaperFields({ fields: nextFields }, this.plugin.settings.defaultField));
      if (normalizedNextFields.join('|') === currentFields.join('|')) {
        modal.close();
        return;
      }

      confirmBtn.disabled = true;
      try {
        const papers = await scanClassificationPapers(this.plugin);
        const paper = papers.find(item => item.path === file.path);
        if (!paper) throw new Error('找不到论文，请刷新后重试。');
        if (JSON.stringify(paper.fields) !== JSON.stringify(currentFields)) {
          throw new Error('论文分类已发生变化，请关闭窗口后重新修改。');
        }
        const result = await applyClassificationPlan(this.plugin, papers, {
          taxonomy: this.plugin.settings.fields,
          defaultField: this.plugin.settings.defaultField,
          changes: [{
            path: file.path,
            beforeFields: paper.fields,
            afterFields: normalizedNextFields.length ? normalizedNextFields : [this.plugin.settings.defaultField],
          }],
        });
        if (result.failed.length || result.skipped.length || !result.updated.includes(file.path)) {
          const details = [...result.failed, ...result.skipped].map(item => item.reason).join('；') || '分类未更新';
          throw new Error(`${details}。备份：${result.backupPath}`);
        }
        modal.close();
        await this.render();
        new Notice(`已更新「${displayName}」的领域标签`);
      } catch (err) {
        new Notice('修改失败：' + (err as Error).message);
      } finally {
        confirmBtn.disabled = false;
      }
    });

    modal.open();
  }

  private getPrimaryFieldStats() {
    return getPrimaryFieldGroups(this.plugin.settings, this.getAllPapers(),
      file => this.app.metadataCache.getFileCache(file)?.frontmatter);
  }

  // The legend and its drill-down use the same exclusive main-field grouping.
  private showFieldPapers(fieldName: string): void {
    const papers = this.getPrimaryFieldStats().find(field => field.name === fieldName)?.papers || [];
    
    // 按修改时间排序
    papers.sort((a, b) => b.stat.mtime - a.stat.mtime);
    
    new FieldPapersModal(this.app, this.plugin, fieldName, papers).open();
  }

  private renderValhalla(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'pm-dashboard-section' });
    const valhallaCount = (this.plugin.settings.ideas || []).filter(idea => idea.inValhalla).length;
    const card = section.createDiv({ cls: 'valhalla-card' });
    card.addEventListener('click', () => this.showValhallaModal());
    const layout = card.createDiv({ cls: 'valhalla-layout' });
    const left = layout.createDiv({ cls: 'valhalla-left' });
    left.createSpan({ cls: 'valhalla-icon', text: '⚔️' });
    const header = left.createDiv({ cls: 'valhalla-header' });
    header.createEl('h3', { cls: 'valhalla-title', text: '英灵殿' });
    layout.createSpan({ cls: 'valhalla-number', text: String(valhallaCount) });
  }

  private showValhallaModal(): void {
    const modal = new Modal(this.app);
    const { contentEl } = modal;
    contentEl.createEl('h2', { text: '英灵殿' });
    const valhallaIdeas = (this.plugin.settings.ideas || []).filter(idea => idea.inValhalla);
    if (valhallaIdeas.length === 0) {
      contentEl.createDiv({ cls: 'pm-empty', text: '英灵殿空空如也' });
    } else {
      const list = contentEl.createDiv({ cls: 'pm-valhalla-list' });
      for (const idea of valhallaIdeas) {
        const item = list.createDiv({ cls: 'pm-valhalla-item' });
        const content = item.createDiv({ cls: 'pm-valhalla-content' });
        const textContent = content.createDiv({ cls: 'pm-idea-text' });
        textContent.createEl('div', { cls: 'pm-idea-title', text: idea.title });
        textContent.createEl('div', { cls: 'pm-idea-body', text: idea.content });
        const removeBtn = item.createEl('button', { cls: 'pm-valhalla-remove-btn', text: '↩' });
        removeBtn.addEventListener('click', async () => {
          await this.plugin.removeIdeaFromValhalla(idea.id);
          new Notice('已从英灵殿移除');
          modal.close();
          this.showValhallaModal();
          this.render();
        });
      }
    }
    modal.open();
  }

  private renderIdeaActions(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'pm-dashboard-section' });
    const buttonRow = section.createDiv({ cls: 'pm-action-buttons-row' });

    const addIdeaBtn = buttonRow.createEl('button', {
      cls: 'mod-cta pm-action-button-idea',
      text: '💡 Record'
    });
    addIdeaBtn.addEventListener('click', () => this.showAddIdeaModal());

    const ideasLibraryBtn = buttonRow.createEl('button', {
      cls: 'pm-action-button-ideas',
      text: '📚 IDEAs'
    });
    ideasLibraryBtn.addEventListener('click', () => this.showIdeasLibraryModal());
  }

  private showAddIdeaModal(): void {
    const modal = new Modal(this.app);

    // 标题栏
    const header = modal.contentEl.createDiv();
    header.style.cssText = 'padding: 24px 24px 16px 24px; background: var(--background-secondary); border-bottom: 1px solid var(--background-modifier-border);';
    header.createEl('h2', { text: '记录灵感' }).style.cssText = 'margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: var(--text-normal);';

    // 激励语
    header.createEl('p', { text: '不记录的灵感，就像没有按下快门的风景。' }).style.cssText = 'margin: 0; font-size: 13px; color: var(--text-muted); font-style: italic;';

    let title = '';
    let content = '';
    let tagType: 'field' | 'custom' | '' = '';
    let selectedField = '';
    let customTagName = '';
    let customColor = '#e03131';

    new Setting(modal.contentEl)
      .setName('标题')
      .setDesc('简短描述你的灵感')
      .addText(text => {
        text.setPlaceholder('输入灵感标题...');
        text.inputEl.addEventListener('change', (e) => {
          title = (e.target as HTMLInputElement).value.trim();
        });
        setTimeout(() => text.inputEl.focus(), 100);
      });

    new Setting(modal.contentEl)
      .setName('内容')
      .setDesc('详细记录你的想法')
      .addTextArea(text => {
        text.setPlaceholder('输入灵感内容...');
        text.inputEl.rows = 4;
        text.inputEl.addEventListener('change', (e) => {
          content = (e.target as HTMLInputElement).value.trim();
        });
      });

    const tagTypeSetting = new Setting(modal.contentEl)
      .setName('标签类型')
      .setDesc('选择标签类型或无标签')
      .addDropdown(drop => {
        drop.addOption('', '无标签');
        drop.addOption('field', '关联论文领域');
        drop.addOption('custom', '自定义标签');
        drop.onChange(v => {
          tagType = v as 'field' | 'custom' | '';
          selectedField = '';
          this.updateIdeaTagVisibility(modal.contentEl, tagType);
        });
      });

    const fieldSetting = new Setting(modal.contentEl);
    fieldSetting.settingEl.classList.add('pm-idea-field-setting');
    fieldSetting.settingEl.style.display = 'none';
    fieldSetting.setName('研究领域').setDesc('选择关联的论文领域');
    fieldSetting.addDropdown(drop => {
      drop.addOption('', '请选择领域');
      this.plugin.settings.fields.forEach(f => {
        drop.addOption(f.name, f.name);
        if (f.aliases) {
          f.aliases.forEach(alias => {
            drop.addOption(alias, `${alias} (${f.name})`);
          });
        }
      });
      drop.onChange(v => {
        selectedField = v;
      });
    });

    const customNameSetting = new Setting(modal.contentEl);
    customNameSetting.settingEl.classList.add('pm-idea-custom-name-setting');
    customNameSetting.settingEl.style.display = 'none';
    customNameSetting.setName('标签名称').setDesc('输入自定义标签的名称');
    customNameSetting.addText(text => {
      text.setPlaceholder('例如：重要、待研究...');
      text.inputEl.addEventListener('change', (e) => {
        customTagName = (e.target as HTMLInputElement).value.trim();
      });
    });

    const colorSetting = new Setting(modal.contentEl);
    colorSetting.settingEl.classList.add('pm-idea-color-setting');
    colorSetting.settingEl.style.display = 'none';
    colorSetting.setName('标签颜色').setDesc('点击色卡选择，也可自由取色');
    let updateColorInput = (_color: string) => {};
    const swatches = renderPaletteSwatches(colorSetting.controlEl, {
      getCurrentColor: () => customColor,
      onSelect: color => {
        customColor = color;
        updateColorInput(color);
      },
    });
    colorSetting.addColorPicker(col => {
      updateColorInput = color => col.setValue(color);
      col.setValue(customColor).onChange(v => {
        customColor = v;
        swatches.refresh();
      });
    });

    const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '20px';

    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.addEventListener('click', () => modal.close());

    const confirmBtn = buttonContainer.createEl('button', {
      text: '保存',
      cls: 'mod-cta'
    });
    confirmBtn.addEventListener('click', async () => {
      if (!title || !content) {
        new Notice('请填写标题和内容');
        return;
      }

      // 如果选择自定义标签，验证标签名称
      if (tagType === 'custom' && !customTagName) {
        new Notice('请输入自定义标签名称');
        return;
      }

      await this.plugin.addIdea(title, content, {
        field: tagType === 'field' ? selectedField : (tagType === 'custom' ? customTagName : undefined),
        color: tagType === 'custom' ? customColor : undefined,
        isCustomTag: tagType === 'custom'
      });

      new Notice('灵感已保存');
      modal.close();
      await this.render();
    });

    modal.open();
  }

  private updateIdeaTagVisibility(contentEl: HTMLElement, tagType: string): void {
    const settings = contentEl.querySelectorAll('.setting-item');
    settings.forEach((setting) => {
      const htmlSetting = setting as HTMLElement;
      if (htmlSetting.classList.contains('pm-idea-field-setting')) {
        htmlSetting.style.display = tagType === 'field' ? 'flex' : 'none';
      } else if (htmlSetting.classList.contains('pm-idea-custom-name-setting')) {
        htmlSetting.style.display = tagType === 'custom' ? 'flex' : 'none';
      } else if (htmlSetting.classList.contains('pm-idea-color-setting')) {
        htmlSetting.style.display = tagType === 'custom' ? 'flex' : 'none';
      }
    });
  }

  private showIdeasLibraryModal(): void {
    const modal = new Modal(this.app);
    const { contentEl } = modal;
    modal.modalEl.style.cssText = 'max-width: 640px; width: 90vw;';

    // 标题栏 - 清晰简洁
    const header = contentEl.createDiv({ cls: 'pm-modal-header' });
    header.style.cssText = 'display: flex; align-items: flex-start; justify-content: flex-start; padding: 8px 0 16px 0; margin: 0;';
    header.createEl('h2', {
      text: '灵感库',
      cls: 'pm-modal-title'
    }).style.cssText = 'margin: 0; text-align: left; width: 100%; font-size: 22px; font-weight: 700; color: var(--text-normal);';

    const ideas = (this.plugin.settings.ideas || []).filter(idea => !idea.inValhalla);

    // 空状态 - 友好引导
    if (ideas.length === 0) {
      const empty = contentEl.createDiv({ cls: 'pm-empty' });
      empty.createDiv({
        text: '📝',
        cls: 'pm-empty-icon'
      });
      empty.createDiv({
        cls: 'pm-empty-text',
        text: '暂无灵感'
      });
      empty.createDiv({
        cls: 'pm-empty-hint',
        text: '点击下方"记录灵感"开始收集吧'
      });
    } else {
      const list = contentEl.createDiv({ cls: 'pm-ideas-list' });
      for (const idea of ideas) {
        this.renderIdeaListItem(list, idea, modal);
      }
    }

    modal.open();
  }

  private renderIdeaListItem(list: HTMLElement, idea: IdeaItem, parentModal: Modal): void {
    const item = list.createDiv({ cls: 'pm-idea-item' });

    const content = item.createDiv({ cls: 'pm-idea-content' });

    const topRow = content.createDiv({ cls: 'pm-idea-top-row' });

    // 标题和领域标签同一行
    const titleRow = topRow.createDiv({ cls: 'pm-idea-title-row' });
    titleRow.createSpan({ cls: 'pm-idea-title', text: idea.title });

    const tagWrapper = topRow.createDiv({ cls: 'pm-idea-tag-wrapper' });

    if (idea.field) {
      const fieldStyle = this.plugin.settings.fields.find(f =>
        f.name === idea.field || (f.aliases && f.aliases.includes(idea.field!))
      );
      if (fieldStyle) {
        const tag = tagWrapper.createSpan({ cls: 'pm-idea-tag' });
        tag.textContent = idea.field;
        tag.style.backgroundColor = fieldStyle.backgroundColor;
        tag.style.color = this.getContrastColor(fieldStyle.backgroundColor);
      }
    } else if (idea.isCustomTag && idea.color) {
      const tag = tagWrapper.createSpan({ cls: 'pm-idea-tag' });
      tag.textContent = idea.field || '自定义';
      tag.style.backgroundColor = idea.color;
      tag.style.color = this.getContrastColor(idea.color);
    }

    const textContainer = content.createDiv({ cls: 'pm-idea-text' });
    textContainer.createDiv({ cls: 'pm-idea-body', text: idea.content });
    const date = new Date(idea.createdAt);
    textContainer.createSpan({ cls: 'pm-idea-time', text: this.formatIdeaTime(date) });

    // Click to show action modal
    item.addEventListener('click', () => {
      this.showIdeaActionModal(idea, parentModal);
    });
  }

  private showIdeaDeleteConfirmModal(idea: IdeaItem, parentModal: Modal): void {
    const modal = new Modal(this.app);

    // 设置 Modal 容器
    modal.modalEl.style.cssText = 'max-width: 420px; width: 90vw;';

    // 主容器
    const container = modal.contentEl.createDiv();
    container.style.cssText = 'display: flex; flex-direction: column; background: var(--background-primary); border-radius: 12px; overflow: hidden; box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);';

    // 头部
    const header = container.createDiv();
    header.style.cssText = 'padding: 24px 24px 20px 24px; background: var(--background-secondary); border-bottom: 1px solid var(--background-modifier-border);';

    // 标题
    header.createEl('h2', { text: '删除灵感' }).style.cssText = 'margin: 0; font-size: 20px; font-weight: 700; color: var(--text-normal); line-height: 1.3;';

    // 内容区域
    const body = container.createDiv();
    body.style.cssText = 'padding: 24px; background: var(--background-primary);';

    // 警告图标 + 文字
    const warningRow = body.createDiv();
    warningRow.style.cssText = 'display: flex; gap: 12px; align-items: flex-start;';

    // 警告图标
    const icon = warningRow.createSpan({ text: '⚠️' });
    icon.style.cssText = 'font-size: 24px; flex-shrink: 0;';

    // 警告文字
    const text = warningRow.createDiv();
    text.style.cssText = 'flex: 1;';

    text.createEl('p', {
      text: `确定要删除「${idea.title}」吗？`
    }).style.cssText = 'margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: var(--text-normal);';

    text.createEl('p', {
      text: '此操作不可撤销。'
    }).style.cssText = 'margin: 0; font-size: 14px; color: var(--text-muted); line-height: 1.5;';

    // 按钮区域（右对齐）
    const actions = container.createDiv();
    actions.style.cssText = 'display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px 24px 24px; background: var(--background-secondary); border-top: 1px solid var(--background-modifier-border);';

    // 取消按钮
    const cancelBtn = actions.createEl('button', { text: '取消' });
    cancelBtn.style.cssText = 'min-height: 38px; padding: 8px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal);';
    cancelBtn.addEventListener('click', () => modal.close());

    // 确认删除按钮（危险操作）
    const confirmBtn = actions.createEl('button', { text: '删除' });
    confirmBtn.style.cssText = 'min-height: 38px; padding: 8px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid #ff3b30; background: #ff3b30; color: white; box-shadow: 0 2px 8px rgba(255, 59, 48, 0.3);';
    confirmBtn.addEventListener('click', () => {
      this.plugin.removeIdea(idea.id);
      new Notice('✓ 灵感已删除');
      modal.close();
      parentModal.close();
      this.showIdeasLibraryModal();
      this.render();
    });

    modal.open();
    cancelBtn.focus();
  }

  private showIdeaEditModal(idea: IdeaItem, parentModal: Modal): void {
    const modal = new Modal(this.app);
    modal.contentEl.addClass('pm-idea-detail-modal');

    const header = modal.contentEl.createDiv({ cls: 'pm-idea-detail-header' });
    header.createEl('h2', {
      text: '编辑灵感',
      cls: 'pm-idea-detail-title'
    });

    const body = modal.contentEl.createDiv({ cls: 'pm-idea-detail-body' });

    const titleInput = body.createEl('input', {
      type: 'text',
      value: idea.title,
      cls: 'pm-idea-detail-title-input'
    });

    const contentInput = body.createEl('textarea', {
      cls: 'pm-idea-detail-textarea'
    });
    contentInput.value = idea.content;
    contentInput.rows = 6;

    const actions = modal.contentEl.createDiv({ cls: 'pm-modal-actions' });
    const buttons = actions.createDiv({ cls: 'pm-button-group' });

    const cancelBtn = buttons.createEl('button', {
      text: '取消',
      cls: 'pm-modal-btn pm-modal-btn-secondary'
    });
    cancelBtn.addEventListener('click', () => modal.close());

    const saveBtn = buttons.createEl('button', {
      text: '保存',
      cls: 'pm-modal-btn pm-modal-btn-primary'
    });
    saveBtn.addEventListener('click', async () => {
      const newTitle = titleInput.value.trim();
      const newContent = contentInput.value.trim();

      if (!newTitle || !newContent) {
        new Notice('标题和内容不能为空');
        return;
      }

      const ideas = this.plugin.settings.ideas || [];
      const ideaIndex = ideas.findIndex(i => i.id === idea.id);
      if (ideaIndex !== -1 && ideas[ideaIndex]) {
        ideas[ideaIndex]!.title = newTitle;
        ideas[ideaIndex]!.content = newContent;
        await this.plugin.saveSettings();
        new Notice('✓ 灵感已更新');
        modal.close();
        parentModal.close();
        this.showIdeasLibraryModal();
        this.render();
      }
    });

    modal.open();
    setTimeout(() => titleInput.focus(), 50);
  }


  private showIdeaActionModal(idea: IdeaItem, parentModal: Modal): void {
    const modal = new Modal(this.app);
    modal.contentEl.addClass('pm-idea-detail-modal');

    // ── 头部区域 ────────────────────────────────────────────────────────
    const header = modal.contentEl.createDiv({ cls: 'pm-idea-detail-header' });

    // 标题和标签在同一行
    const titleRow = header.createDiv({ cls: 'pm-idea-detail-title-row' });

    // 标题容器（支持查看/编辑切换）
    const titleContainer = titleRow.createDiv({ cls: 'pm-idea-detail-title-container' });

    // 查看模式：标题显示
    const titleDisplay = titleContainer.createEl('h2', {
      text: idea.title,
      cls: 'pm-idea-detail-title'
    });

    // 时间信息
    const date = new Date(idea.createdAt);
    const timeEl = header.createEl('div', {
      text: this.formatIdeaTime(date),
      cls: 'pm-idea-detail-time'
    });

    // ── 内容区域 ────────────────────────────────────────────────────────
    const body = modal.contentEl.createDiv({ cls: 'pm-idea-detail-body' });

    // 查看模式：内容显示
    const contentDisplay = body.createEl('p', {
      text: idea.content,
      cls: 'pm-idea-detail-text'
    });

    // ── 操作按钮区域 ───────────────────────────────────────────────────
    const actions = modal.contentEl.createDiv({ cls: 'pm-modal-actions' });

    // 查看模式按钮组
    const viewModeButtons = actions.createDiv({ cls: 'pm-button-group' });

    const editBtn = viewModeButtons.createEl('button', {
      text: '编辑',
      cls: 'pm-modal-btn pm-modal-btn-primary'
    });
    editBtn.addEventListener('click', () => {
      modal.close();
      this.showIdeaEditModal(idea, parentModal);
    });

    const valhallaBtn = viewModeButtons.createEl('button', {
      text: '✨ 归入英灵殿',
      cls: 'pm-modal-btn pm-modal-btn-secondary'
    });
    valhallaBtn.addEventListener('click', async () => {
      await this.plugin.moveIdeaToValhalla(idea.id);
      new Notice('✓ 已归入英灵殿');
      modal.close();
      parentModal.close();
      this.showIdeasLibraryModal();
      this.render();
    });

    // 查看模式下的取消/关闭按钮
    const closeBtn = viewModeButtons.createEl('button', {
      text: '取消',
      cls: 'pm-modal-btn pm-modal-btn-secondary'
    });
    closeBtn.addEventListener('click', () => {
      modal.close();
    });

    const deleteViewBtn = viewModeButtons.createEl('button', {
      text: '删除',
      cls: 'pm-modal-btn pm-modal-btn-destructive'
    });
    deleteViewBtn.addEventListener('click', () => {
      modal.close();
      this.showIdeaDeleteConfirmModal(idea, parentModal);
    });

    modal.open();
  }



  private formatIdeaTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return diffMinutes <= 1 ? '刚刚' : `${diffMinutes}分钟前`;
      }
      return `${diffHours}小时前`;
    }
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}月前`;
    return `${Math.floor(diffDays / 365)}年前`;
  }

  private renderCalendar(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'pm-dashboard-section' });
    const allPapers = this.getAllPapers();

    const header = section.createDiv({ cls: 'pm-calendar-header' });

    const currentDate = new Date();
    const currentYear = this.calendarDisplayYear ?? currentDate.getFullYear();
    const currentMonth = this.calendarDisplayMonth ?? (currentDate.getMonth() + 1);

    // 年月显示 + 动态热力图指示条
    const headerMain = header.createDiv({ cls: 'pm-calendar-header-main' });

    const yearMonthDisplay = headerMain.createDiv({ cls: 'pm-calendar-yearmonth-clickable' });
    yearMonthDisplay.createSpan({
      cls: 'pm-calendar-current',
      text: `${currentYear}年${currentMonth}月`
    });
    yearMonthDisplay.addEventListener('click', () => this.showMonthPickerModal(currentYear, currentMonth));

    // 动态热力图指示条
    const monthIdeas = (this.plugin.settings.ideas || []).filter(idea => {
      const ideaDate = new Date(idea.createdAt);
      return ideaDate.getFullYear() === currentYear && ideaDate.getMonth() + 1 === currentMonth;
    });

    const currentTotal = monthIdeas.length;

    const dayIdeaCounts = new Map<string, number>();
    for (const idea of monthIdeas) {
      const ideaDate = new Date(idea.createdAt);
      const key = `${ideaDate.getFullYear()}-${String(ideaDate.getMonth() + 1).padStart(2, '0')}-${String(ideaDate.getDate()).padStart(2, '0')}`;
      dayIdeaCounts.set(key, (dayIdeaCounts.get(key) || 0) + 1);
    }

    const maxCount = Math.max(...Array.from(dayIdeaCounts.values()), 0);
    const minLegendCount = maxCount > 0 ? 1 : 0;

    const legend = headerMain.createDiv({ cls: 'pm-calendar-legend-inline' });
    legend.createSpan({ cls: 'pm-legend-label', text: `${minLegendCount}` });

    // 渐变进度条（浅蓝→浅红）
    const legendBar = legend.createDiv({ cls: 'pm-calendar-legend-gradient' });
    const progressFill = legendBar.createDiv({ cls: 'pm-calendar-legend-segment' });

    progressFill.style.width = '100%';
    progressFill.style.background = this.getIdeaHeatmapGradient(maxCount);

    legend.createSpan({ cls: 'pm-legend-label', text: `${maxCount}` });

    const calendarGrid = section.createDiv({ cls: 'pm-calendar-grid' });

    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    for (const day of weekdays) {
      const dayHeader = calendarGrid.createDiv({ cls: 'pm-calendar-day-header' });
      dayHeader.textContent = day;
    }

    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay();

    for (let i = 0; i < firstDayOfWeek; i++) {
      calendarGrid.createDiv({ cls: 'pm-calendar-day-empty' });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayCell = calendarGrid.createDiv({ cls: 'pm-calendar-day' });

      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday =
        currentYear === currentDate.getFullYear() &&
        currentMonth === currentDate.getMonth() + 1 &&
        day === currentDate.getDate();
      const dayIdeas = monthIdeas.filter(idea => {
        const ideaDate = new Date(idea.createdAt);
        const ideaDateStr = `${ideaDate.getFullYear()}-${String(ideaDate.getMonth() + 1).padStart(2, '0')}-${String(ideaDate.getDate()).padStart(2, '0')}`;
        return ideaDateStr === dateStr;
      });
      const dayPapers = allPapers.filter(file => this.getFileDateString(file.stat.ctime) === dateStr);
      const hasPapers = dayPapers.length > 0;

      const dayNumber = dayCell.createDiv({ cls: 'pm-calendar-day-number' });
      dayNumber.textContent = String(day);

      if (isToday) {
        dayCell.classList.add('pm-calendar-day-today');
      }

      if (hasPapers) {
        dayCell.classList.add('pm-calendar-day-has-papers');
      }

      // 根据灵感数量计算颜色（动态渐变）
      const ideaCount = dayIdeas.length;
      if (ideaCount > 0) {
        dayCell.classList.add('pm-calendar-day-has-ideas');

        dayCell.style.cssText = `background: ${this.getIdeaHeatmapColor(ideaCount, maxCount)};`;
      } else if (hasPapers) {
        dayCell.style.cssText = 'background: var(--background-modifier-form-field);';
      } else {
        // 无灵感的天数显示浅灰色背景
        dayCell.style.cssText = 'background: var(--background-secondary);';
      }

      dayCell.addEventListener('click', () => {
        this.showDaySummaryModal(dateStr, dayIdeas, dayPapers);
      });
    }
  }


  private showMonthPickerModal(initialYear?: number, initialMonth?: number): void {
    const modal = new Modal(this.app);
    const { contentEl } = modal;

    const container = contentEl.createDiv({ cls: 'pm-month-picker-container' });

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    let selectedYear = initialYear ?? this.calendarDisplayYear ?? currentYear;
    let selectedMonth = initialMonth ?? this.calendarDisplayMonth ?? currentMonth;

    // 年份选择器（左右箭头）
    const yearSection = container.createDiv({ cls: 'pm-year-selector' });

    const leftBtn = yearSection.createEl('button', {
      cls: 'pm-year-nav-btn',
      text: '‹'
    });
    leftBtn.addEventListener('click', () => {
      selectedYear--;
      yearDisplay.textContent = `${selectedYear}年`;
    });

    const yearDisplay = yearSection.createSpan({
      cls: 'pm-year-display',
      text: `${selectedYear}年`
    });

    const rightBtn = yearSection.createEl('button', {
      cls: 'pm-year-nav-btn',
      text: '›'
    });
    rightBtn.addEventListener('click', () => {
      selectedYear++;
      yearDisplay.textContent = `${selectedYear}年`;
    });

    // 月份选择器（1-12月网格）
    const monthSection = container.createDiv({ cls: 'pm-month-picker-section' });
    const monthGrid = monthSection.createDiv({ cls: 'pm-month-grid' });

    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    months.forEach((m, idx) => {
      const monthBtn = monthGrid.createDiv({
        cls: 'pm-month-cell',
        text: m
      });
      if (idx + 1 === selectedMonth && selectedYear === currentYear) {
        monthBtn.classList.add('pm-month-cell-selected');
      }
      monthBtn.addEventListener('click', () => {
        monthGrid.querySelectorAll('.pm-month-cell').forEach(b => b.classList.remove('pm-month-cell-selected'));
        monthBtn.classList.add('pm-month-cell-selected');
        selectedMonth = idx + 1;
      });
    });

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '20px';

    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.addEventListener('click', () => modal.close());

    const confirmBtn = buttonContainer.createEl('button', {
      text: '查看',
      cls: 'mod-cta'
    });
    confirmBtn.addEventListener('click', () => {
      this.calendarDisplayYear = selectedYear;
      this.calendarDisplayMonth = selectedMonth;
      modal.close();
      this.render();
    });

    modal.open();
  }

  private getAllPapers(): TFile[] {
    const byCategory = getPapersByCategory(this.app, this.plugin.settings);
    const papers: TFile[] = [];

    for (const files of Object.values(byCategory)) {
      for (const file of files) {
        papers.push(file as TFile);
      }
    }

    return papers;
  }

  private getFileDateString(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private renderDayPaperItem(list: HTMLElement, file: TFile, modal: Modal): void {
    const item = list.createDiv({ cls: 'pm-field-paper-item' });
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;

    const paperFields = this.getPaperFields(fm);
    const primaryField = paperFields[0] || this.plugin.settings.defaultField;
    const fieldStyle = getFieldStyle(this.plugin.settings, primaryField);
    if (fieldStyle) {
      item.style.borderLeft = `3px solid ${fieldStyle.backgroundColor}`;
    }

    const content = item.createDiv({ cls: 'pm-field-paper-content' });

    const titleRow = content.createDiv({ cls: 'pm-field-paper-title-row' });
    const displayName = file.basename.replace(/^【.+?】-/, '');
    titleRow.createSpan({ cls: 'pm-field-paper-title', text: displayName });
    this.createFieldTags(titleRow, paperFields, undefined, 'pm-subfield-tag');

    const metaRow = content.createDiv({ cls: 'pm-field-paper-meta' });
    const metaParts: string[] = [];
    if (fm?.date) metaParts.push(fm.date);
    if (fm?.journal) metaParts.push(fm.journal);
    if (fm?.authors) {
      const authors = Array.isArray(fm.authors) ? fm.authors[0] : fm.authors.split(',')[0];
      metaParts.push(authors);
    }
    metaRow.textContent = metaParts.join(' · ');

    item.addEventListener('click', async () => {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      modal.close();
    });
  }

  private showDaySummaryModal(dateStr: string, ideas: IdeaItem[], papers: TFile[]): void {
    const modal = new Modal(this.app);
    const { contentEl } = modal;

    contentEl.createEl('h2', { text: `${dateStr}` });

    const ideaSection = contentEl.createDiv();
    ideaSection.createEl('h3', { text: '每日灵感' });

    if (ideas.length === 0) {
      ideaSection.createDiv({ cls: 'pm-empty', text: '暂无灵感' });
    } else {
      const list = ideaSection.createDiv({ cls: 'pm-ideas-list' });
      for (const idea of ideas) {
        this.renderIdeaListItem(list, idea, modal);
      }
    }

    const paperSection = contentEl.createDiv();
    paperSection.createEl('h3', { text: '当天添加的论文' });

    if (papers.length === 0) {
      paperSection.createDiv({ cls: 'pm-empty', text: '当天没有新增论文' });
    } else {
      papers.sort((a, b) => b.stat.ctime - a.stat.ctime);
      const list = paperSection.createDiv({ cls: 'pm-field-papers-list' });
      for (const paper of papers) {
        this.renderDayPaperItem(list, paper, modal);
      }
    }

    modal.open();
  }
}
