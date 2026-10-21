import { App, Modal, Notice, PluginSettingTab, Setting } from 'obsidian';
import MyPlugin from './main';
import { FieldStyle, IdeaItem } from './types';
import { renderFieldPaletteSetting } from './ui/FieldPaletteSetting';
import { renderPalettePicker } from './ui/PalettePicker';
import { applyPaperPalette, PaperPalette } from './utils/colorPalettes';
import { PAPER_VIEW_TYPE, PaperView } from './ui/PaperView';
import { ClassificationOrganizerModal } from './ui/classification/ClassificationOrganizerModal';
import { DEFAULT_READING_SETTINGS, ReadingSettings } from './reading/config';

export interface MyPluginSettings {
  paperReading: ReadingSettings;
  workspaceFolder: string;
  unreadFolderName: string;
  readFolderName: string;
  labels: string[];
  ieeeApiKey: string;
  excalidrawFilePath: string;
  addCardToExcalidraw: boolean; // 添加论文时是否在 Excalidraw 中添加卡片
  fields: FieldStyle[]; // 领域样式列表
  defaultField: string; // 默认领域
  translateAbstract?: boolean;  // 是否翻译摘要
  siliconflowApiKey?: string;   // 硅基流动API密钥
  translationModel?: string;    // 翻译模型名称
  ideas?: IdeaItem[];
}

export const DEFAULT_FIELDS: FieldStyle[] = [
  {
    name: '计算机科学',
    backgroundColor: '#e3f2fd',
    backgroundPattern: 'dots',
    patternColor: '#90caf9',
    textColor: '#1565c0',
    borderColor: '#64b5f6',
    roughness: 0,
    opacity: 100,
    roundness: 2,
    titleFontSize: 14,
    titleFontFamily: 4,
    metaFontSize: 11,
    metaFontFamily: 4,
    cardWidth: 280,
    cardHeight: 180,
    titleAlignment: 'left',
    titleTextColor: undefined,
    metaTextColor: undefined,
  },
  {
    name: '机器学习',
    backgroundColor: '#f3e5f5',
    backgroundPattern: 'grid',
    patternColor: '#ce93d8',
    textColor: '#6a1b9a',
    borderColor: '#ba68c8',
    roughness: 0,
    opacity: 100,
    roundness: 2,
    titleFontSize: 14,
    titleFontFamily: 4,
    metaFontSize: 11,
    metaFontFamily: 4,
    cardWidth: 280,
    cardHeight: 180,
    titleAlignment: 'left',
    titleTextColor: undefined,
    metaTextColor: undefined,
  },
  {
    name: '自然语言处理',
    backgroundColor: '#e8f5e9',
    backgroundPattern: 'lines',
    patternColor: '#a5d6a7',
    textColor: '#2e7d32',
    borderColor: '#81c784',
    roughness: 0,
    opacity: 100,
    roundness: 2,
    titleFontSize: 14,
    titleFontFamily: 4,
    metaFontSize: 11,
    metaFontFamily: 4,
    cardWidth: 280,
    cardHeight: 180,
    titleAlignment: 'left',
    titleTextColor: undefined,
    metaTextColor: undefined,
  },
  {
    name: '其他',
    backgroundColor: '#fff3e0',
    backgroundPattern: 'solid',
    patternColor: '#ffcc80',
    textColor: '#ef6c00',
    borderColor: '#ffb74d',
    roughness: 0,
    opacity: 100,
    roundness: 2,
    titleFontSize: 14,
    titleFontFamily: 4,
    metaFontSize: 11,
    metaFontFamily: 4,
    cardWidth: 280,
    cardHeight: 180,
    titleAlignment: 'left',
    titleTextColor: undefined,
    metaTextColor: undefined,
  },
];

export const DEFAULT_SETTINGS: MyPluginSettings = {
  paperReading: DEFAULT_READING_SETTINGS,
  workspaceFolder: '',
  unreadFolderName: '未阅读论文列表',
  readFolderName: '已阅读论文列表',
  labels: ['粗读', '精读'],
  ieeeApiKey: '',
  excalidrawFilePath: '',
  addCardToExcalidraw: true, // 默认启用
  fields: DEFAULT_FIELDS,
  defaultField: '其他',
  translateAbstract: false,
  siliconflowApiKey: '',
  translationModel: 'Qwen/Qwen2.5-7B-Instruct',
  ideas: [],
};

export class PaperSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  activeFieldIndex: number = 0; // 当前选中的领域索引
  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    plugin.register(() => this.hide());
  }

  hide(): void {
  }

  display(): void {
    this.hide();
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: '论文管理' });

    // ── 基本设置 ────────────────────────────────────────────────────────
    this.addSectionHeader(containerEl, '基本设置');

    new Setting(containerEl)
      .setName('工作文件夹')
      .setDesc('用于存储和管理论文的文件夹')
      .addText(text =>
        text
          .setPlaceholder('例如：论文管理')
          .setValue(this.plugin.settings.workspaceFolder)
          .onChange(async value => {
            this.plugin.settings.workspaceFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('未读论文')
      .addText(text =>
        text
          .setValue(this.plugin.settings.unreadFolderName)
          .setPlaceholder('未阅读论文列表')
          .onChange(async value => {
            this.plugin.settings.unreadFolderName = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('已读论文')
      .addText(text =>
        text
          .setValue(this.plugin.settings.readFolderName)
          .setPlaceholder('已阅读论文列表')
          .onChange(async value => {
            this.plugin.settings.readFolderName = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('分类标签')
      .setDesc('用逗号分隔，例如：粗读,精读')
      .addText(text =>
        text
          .setValue(this.plugin.settings.labels.join(','))
          .setPlaceholder('粗读,精读')
          .onChange(async value => {
            this.plugin.settings.labels = value
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            await this.plugin.saveSettings();
          })
      );

    // ── Excalidraw 集成 ──────────────────────────────────────────────────
    this.addSectionHeader(containerEl, 'Excalidraw 集成');

    new Setting(containerEl)
      .setName('Excalidraw 文件')
      .setDesc('留空则使用默认位置')
      .addText(text =>
        text
          .setPlaceholder('Papers/论文关系图.md')
          .setValue(this.plugin.settings.excalidrawFilePath)
          .onChange(async value => {
            this.plugin.settings.excalidrawFilePath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('添加论文时创建卡片')
      .setDesc('添加论文时自动在 Excalidraw 中创建卡片')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.addCardToExcalidraw)
          .onChange(async value => {
            this.plugin.settings.addCardToExcalidraw = value;
            await this.plugin.saveSettings();
          })
      );

    // ── 数据源 ────────────────────────────────────────────────────────────
    this.addSectionHeader(containerEl, '数据源');

    new Setting(containerEl)
      .setName('IEEE Xplore API key')
      .setDesc('可选。留空时，选择 IEEE 并搜索会将标题或 DOI 发送到 Crossref；文献链接会请求 IEEE 页面。填写后使用 IEEE 官方接口，并向 IEEE 发送检索内容和 Key。不会上传笔记内容。')
      .addText(text => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('输入 API Key')
          .setValue(this.plugin.settings.ieeeApiKey)
          .onChange(async value => {
            this.plugin.settings.ieeeApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    // ── 摘要翻译 ────────────────────────────────────────────────────────────
    this.addSectionHeader(containerEl, '摘要翻译');

    new Setting(containerEl)
      .setName('启用翻译')
      .setDesc('在创建论文时自动翻译摘要')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.translateAbstract || false)
          .onChange(async value => {
            this.plugin.settings.translateAbstract = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('硅基流动 API Key')
      .setDesc('用于翻译摘要（从 https://cloud.siliconflow.cn 获取）')
      .addText(text =>
        text
          .setPlaceholder('输入 API Key')
          .setValue(this.plugin.settings.siliconflowApiKey || '')
          .onChange(async value => {
            this.plugin.settings.siliconflowApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('翻译模型')
      .setDesc('选择用于翻译的AI模型')
      .addDropdown(dropdown => {
        const models = [
          { value: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B (推荐)' },
          { value: 'Qwen/Qwen2.5-14B-Instruct', label: 'Qwen2.5-14B' },
          { value: 'Qwen/Qwen2.5-32B-Instruct', label: 'Qwen2.5-32B' },
          { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5-72B' },
          { value: 'deepseek-ai/DeepSeek-V2.5', label: 'DeepSeek-V2.5' },
        ];
        models.forEach(m => dropdown.addOption(m.value, m.label));
        dropdown.setValue(this.plugin.settings.translationModel || 'Qwen/Qwen2.5-7B-Instruct')
          .onChange(async value => {
            this.plugin.settings.translationModel = value;
            await this.plugin.saveSettings();
          });
      });


    new Setting(containerEl)
      .setName('主领域与子领域')
      .setDesc('查看分类建议、重命名或合并领域、批量调整论文分类。应用前自动备份，可恢复历史分类。')
      .addButton(button => button.setButtonText('整理分类').onClick(() => this.openClassificationOrganizer()));

    this.addSectionHeader(containerEl, '领域样式');
    containerEl.createEl('p', {
      text: '选择背景色或调整领域卡片样式。',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('默认领域')
      .addDropdown(dropdown => {
        this.plugin.settings.fields.forEach(field => {
          dropdown.addOption(field.name, field.name);
        });
        dropdown
          .setValue(this.plugin.settings.defaultField)
          .onChange(async value => {
            this.plugin.settings.defaultField = value;
            await this.plugin.saveSettings();
          });
      });

    // 渲染领域列表
    this.renderFieldsList(containerEl);

  }

  renderFieldsList(containerEl: HTMLElement): void {
    const fieldsContainer = containerEl.createDiv({ cls: 'pm-fields-list' });
    fieldsContainer.style.marginTop = '16px';

    // 创建标签导航栏
    const tabsNav = fieldsContainer.createDiv({ cls: 'pm-tabs-nav' });
    tabsNav.style.display = 'flex';
    tabsNav.style.flexWrap = 'wrap';
    tabsNav.style.gap = '8px';
    tabsNav.style.marginBottom = '16px';
    tabsNav.style.borderBottom = '1px solid var(--background-modifier-border)';
    tabsNav.style.paddingBottom = '8px';

    // 为每个领域创建标签按钮和对应的内容区域
    const fieldItems: HTMLElement[] = [];

    this.plugin.settings.fields.forEach((field, index) => {
      // 创建标签按钮
      const tabBtn = tabsNav.createEl('button', {
        text: field.name,
        cls: 'pm-tab-btn',
      });
      tabBtn.style.padding = '8px 16px';
      tabBtn.style.border = '1px solid var(--background-modifier-border)';
      tabBtn.style.borderRadius = '6px';
      tabBtn.style.background = 'var(--background-secondary)';
      tabBtn.style.cursor = 'pointer';
      tabBtn.style.fontSize = '14px';
      tabBtn.style.fontWeight = '500';
      tabBtn.style.transition = 'all 0.2s ease';

      // 创建领域设置区域
      const fieldItem = fieldsContainer.createDiv({ cls: 'pm-field-item' });
      fieldItem.style.border = '1px solid var(--background-modifier-border)';
      fieldItem.style.borderRadius = '8px';
      fieldItem.style.padding = '12px';
      fieldItem.style.marginBottom = '12px';
      fieldItem.style.background = 'var(--background-secondary)';

      // 默认隐藏所有领域设置
      fieldItem.style.display = index === this.activeFieldIndex ? 'block' : 'none';

      fieldItems.push(fieldItem);

      // 标签按钮点击事件
      tabBtn.addEventListener('click', () => {
        // 更新 activeFieldIndex
        this.activeFieldIndex = index;

        // 隐藏所有领域设置
        fieldItems.forEach((item, i) => {
          item.style.display = i === index ? 'block' : 'none';
        });

        // 更新所有标签按钮的样式
        const allTabs = tabsNav.querySelectorAll('.pm-tab-btn');
        allTabs.forEach((tab, i) => {
          if (i === index) {
            (tab as HTMLElement).style.background = 'var(--interactive-accent)';
            (tab as HTMLElement).style.color = 'var(--text-on-accent)';
            (tab as HTMLElement).style.borderColor = 'var(--interactive-accent)';
          } else {
            (tab as HTMLElement).style.background = 'var(--background-secondary)';
            (tab as HTMLElement).style.color = 'var(--text-normal)';
            (tab as HTMLElement).style.borderColor = 'var(--background-modifier-border)';
          }
        });
      });

      // 初始化标签按钮样式
      if (index === this.activeFieldIndex) {
        tabBtn.style.background = 'var(--interactive-accent)';
        tabBtn.style.color = 'var(--text-on-accent)';
        tabBtn.style.borderColor = 'var(--interactive-accent)';
      }
    });

    // 添加新领域按钮
    const addBtn = tabsNav.createEl('button', {
      text: '+ 添加',
      cls: 'pm-add-field-btn',
    });
    addBtn.style.padding = '8px 16px';
    addBtn.style.border = '1px dashed var(--interactive-accent)';
    addBtn.style.borderRadius = '6px';
    addBtn.style.background = 'transparent';
    addBtn.style.cursor = 'pointer';
    addBtn.style.fontSize = '14px';
    addBtn.style.fontWeight = '500';
    addBtn.style.color = 'var(--interactive-accent)';
    addBtn.style.transition = 'all 0.2s ease';
    addBtn.style.marginLeft = 'auto'; // 推到右边

    addBtn.addEventListener('click', () => {
      // 显示添加新领域的模态框
      new AddFieldModal(
        this.app,
        this.plugin.settings.fields,
        (newField: FieldStyle) => {
          this.plugin.settings.fields.push(newField);
          this.plugin.saveSettings();
          // 切换到新添加的领域
          this.activeFieldIndex = this.plugin.settings.fields.length - 1;
          this.display(); // 刷新设置页面
        }
      ).open();
    });

    // 为每个领域创建内容
    this.plugin.settings.fields.forEach((field, index) => {
      const fieldItem = fieldItems[index]!;

      // 领域名称区域（包含名称输入和关联领域管理）
      const header = fieldItem.createDiv({ cls: 'pm-field-header' });
      header.style.display = 'flex';
      header.style.flexWrap = 'wrap';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.gap = '12px';
      header.style.marginBottom = '12px';

      // 左侧：名称输入
      const nameContainer = header.createDiv();
      nameContainer.style.display = 'flex';
      nameContainer.style.alignItems = 'center';
      nameContainer.style.gap = '8px';

      const nameInput = nameContainer.createEl('input', {
        type: 'text',
        value: field.name,
      });
      nameInput.style.fontSize = '1.1em';
      nameInput.style.fontWeight = '600';
      nameInput.style.border = 'none';
      nameInput.style.background = 'transparent';
      nameInput.style.color = 'var(--text-normal)';
      nameInput.style.width = '200px';
      nameInput.readOnly = true;
      nameInput.title = '在“整理分类”中修改名称，同时同步论文标签';

      // 右侧按钮组
      const btnGroup = header.createDiv();
      btnGroup.style.display = 'flex';
      btnGroup.style.gap = '8px';

      const editTaxonomy = btnGroup.createEl('button', { text: '整理分类' });
      editTaxonomy.addEventListener('click', () => this.openClassificationOrganizer());

      // 关联领域显示区域
      if (field.aliases && field.aliases.length > 0) {
        const aliasesContainer = fieldItem.createDiv({ cls: 'pm-aliases-container' });
        aliasesContainer.style.marginBottom = '12px';
        aliasesContainer.style.display = 'flex';
        aliasesContainer.style.flexWrap = 'wrap';
        aliasesContainer.style.gap = '6px';
        aliasesContainer.style.alignItems = 'center';

        const aliasesLabel = aliasesContainer.createEl('span', { text: '子领域：' });
        aliasesLabel.style.fontSize = '12px';
        aliasesLabel.style.color = 'var(--text-muted)';
        aliasesLabel.style.marginRight = '4px';

        field.aliases.forEach(alias => {
          const aliasTag = aliasesContainer.createDiv({ cls: 'pm-alias-tag' });
          aliasTag.style.display = 'inline-flex';
          aliasTag.style.alignItems = 'center';
          aliasTag.style.gap = '4px';
          aliasTag.style.padding = '2px 8px';
          aliasTag.style.background = 'var(--interactive-accent)';
          aliasTag.style.color = 'var(--text-on-accent)';
          aliasTag.style.borderRadius = '4px';
          aliasTag.style.fontSize = '12px';

          aliasTag.createEl('span', { text: alias });

        });
      }

      // 样式设置
      this.addFieldStyleSetting(fieldItem!, field, index);
    });
  }

  private openClassificationOrganizer(): void {
    new ClassificationOrganizerModal(this.app, this.plugin, async () => {
      this.activeFieldIndex = Math.min(this.activeFieldIndex, this.plugin.settings.fields.length - 1);
      this.display();
      await Promise.allSettled(this.app.workspace.getLeavesOfType(PAPER_VIEW_TYPE)
        .map(leaf => (leaf.view as PaperView).render()));
    }).open();
  }

  // 显示添加关联领域的弹窗
  showAddAliasModal(field: FieldStyle, fieldIndex: number, containerEl: HTMLElement): void {
    const modal = new AliasInputModal(
      this.app,
      '添加关联领域',
      '输入要与 "' + field.name + '" 共享样式的新领域名称',
      (aliasName: string) => {
        if (!aliasName || aliasName.trim() === '') {
          new Notice('领域名称不能为空');
          return;
        }
        // 检查是否已存在
        const allNames = this.getAllFieldNames();
        if (allNames.includes(aliasName.trim())) {
          new Notice('该领域名称已存在');
          return;
        }
        // 添加关联领域
        const targetField = this.plugin.settings.fields[fieldIndex];
        if (!targetField) {
          new Notice('找不到目标领域');
          return;
        }
        if (!targetField.aliases) {
          targetField.aliases = [];
        }
        targetField.aliases.push(aliasName.trim());
        this.plugin.saveSettings();
        this.display();
        new Notice('已添加关联领域: ' + aliasName);
      }
    );
    modal.open();
  }

  // 获取所有领域名称（包括关联领域）
  getAllFieldNames(): string[] {
    const names: string[] = [];
    this.plugin.settings.fields.forEach(field => {
      names.push(field.name);
      if (field.aliases) {
        names.push(...field.aliases);
      }
    });
    return names;
  }


    addFieldStyleSetting(containerEl: HTMLElement, field: FieldStyle, index: number): void {
    // 预览容器（包含卡片预览和字体预览）
    const previewContainer = containerEl.createDiv({ cls: 'pm-preview-container' });
    previewContainer.style.marginTop = '12px';
    previewContainer.style.display = 'flex';
    previewContainer.style.gap = '20px';
    previewContainer.style.alignItems = 'flex-start';

    // 卡片预览区域
    const cardPreview = previewContainer.createDiv({ cls: 'pm-field-preview' });
    cardPreview.style.padding = '16px';
    cardPreview.style.borderRadius = '6px';
    cardPreview.style.border = `2px solid ${field.borderColor}`;
    cardPreview.style.background = field.backgroundColor;
    cardPreview.style.flexShrink = '0';
    this.updateFieldPreview(cardPreview, field);

    // 字体预览区域
    const fontPreview = previewContainer.createDiv({ cls: 'pm-font-preview' });
    fontPreview.style.flex = '1';
    fontPreview.style.padding = '20px';
    fontPreview.style.borderRadius = '6px';
    fontPreview.style.border = '2px solid var(--background-modifier-border)';
    fontPreview.style.background = field.backgroundColor;
    this.updateFontPreview(fontPreview, field);

    // 样式控制 - 精简版（只保留核心设置）
    const controls = containerEl.createDiv({ cls: 'pm-field-controls' });
    controls.style.marginTop = '16px';

    renderFieldPaletteSetting(controls, {
      field,
      save: async () => {
        await this.plugin.saveSettings();
        await Promise.allSettled(this.app.workspace.getLeavesOfType(PAPER_VIEW_TYPE)
          .map(leaf => (leaf.view as PaperView).render()));
      },
      onChanged: () => {
        this.updateFieldPreview(cardPreview, field);
        this.updateFontPreview(fontPreview, field);
      },
    });

    // ── 核心设置（常用）────────────────────────────────────────────
    const coreSettings = controls.createDiv();
    coreSettings.style.display = 'grid';
    coreSettings.style.gridTemplateColumns = 'repeat(3, 1fr)';
    coreSettings.style.gap = '8px';

    // 纹理类型
    new Setting(coreSettings)
      .setName('纹理')
      .addDropdown(dropdown => {
        dropdown.addOption('solid', '纯色');
        dropdown.addOption('dots', '点阵');
        dropdown.addOption('grid', '网格');
        dropdown.addOption('lines', '线条');
        dropdown
          .setValue(field.backgroundPattern || 'solid')
          .onChange(async value => {
            if (this.plugin.settings.fields[index]) this.plugin.settings.fields[index]!.backgroundPattern = value as any;
            await this.plugin.saveSettings();
            this.updateFieldPreview(cardPreview, this.plugin.settings.fields[index]!);
            this.updateFontPreview(fontPreview, this.plugin.settings.fields[index]!);
          });
      });

    // ── 高级设置（折叠）────────────────────────────────────────────
    const advancedToggle = controls.createDiv();
    advancedToggle.style.marginTop = '12px';

    const advancedHeader = advancedToggle.createEl('details', { cls: 'pm-advanced-toggle' });
    const summary = advancedHeader.createEl('summary', { text: '高级设置' });
    summary.style.cursor = 'pointer';
    summary.style.fontSize = '13px';
    summary.style.color = 'var(--text-muted)';
    summary.style.padding = '8px 0';
    summary.style.borderTop = '1px solid var(--background-modifier-border)';

    const advancedContent = advancedHeader.createDiv();
    advancedContent.style.marginTop = '12px';
    advancedContent.style.display = 'grid';
    advancedContent.style.gridTemplateColumns = 'repeat(3, 1fr)';
    advancedContent.style.gap = '8px';

    // 圆角
    new Setting(advancedContent)
      .setName('圆角')
      .addSlider(slider => {
        slider
          .setLimits(0, 3, 1)
          .setValue(field.roundness)
          .setDynamicTooltip()
          .onChange(async value => {
            if (this.plugin.settings.fields[index]) this.plugin.settings.fields[index]!.roundness = value;
            await this.plugin.saveSettings();
            this.updateFieldPreview(cardPreview, this.plugin.settings.fields[index]!);
            this.updateFontPreview(fontPreview, this.plugin.settings.fields[index]!);
          });
      });

    // 粗糙度
    new Setting(advancedContent)
      .setName('粗糙度')
      .addSlider(slider => {
        slider
          .setLimits(0, 2, 1)
          .setValue(field.roughness)
          .setDynamicTooltip()
          .onChange(async value => {
            if (this.plugin.settings.fields[index]) this.plugin.settings.fields[index]!.roughness = value;
            await this.plugin.saveSettings();
            this.updateFieldPreview(cardPreview, this.plugin.settings.fields[index]!);
            this.updateFontPreview(fontPreview, this.plugin.settings.fields[index]!);
          });
      });

    // 透明度
    new Setting(advancedContent)
      .setName('透明度')
      .addSlider(slider => {
        slider
          .setLimits(0, 100, 5)
          .setValue(field.opacity)
          .setDynamicTooltip()
          .onChange(async value => {
            if (this.plugin.settings.fields[index]) this.plugin.settings.fields[index]!.opacity = value;
            await this.plugin.saveSettings();
            this.updateFieldPreview(cardPreview, this.plugin.settings.fields[index]!);
            this.updateFontPreview(fontPreview, this.plugin.settings.fields[index]!);
          });
      });

    // 标题字体
    new Setting(advancedContent)
      .setName('标题字体')
      .addDropdown(dropdown => {
        const fontOptions = [
          { value: 1, label: '手写风格' },
          { value: 2, label: '无衬线' },
          { value: 3, label: '等宽字体' },
          { value: 4, label: 'Comic Sans' },
        ];
        fontOptions.forEach(opt => dropdown.addOption(opt.value.toString(), opt.label));
        dropdown.setValue(field.titleFontFamily.toString())
          .onChange(async value => {
            if (this.plugin.settings.fields[index]) this.plugin.settings.fields[index]!.titleFontFamily = parseInt(value);
            await this.plugin.saveSettings();
            this.updateFieldPreview(cardPreview, this.plugin.settings.fields[index]!);
            this.updateFontPreview(fontPreview, this.plugin.settings.fields[index]!);
          });
      });

    // 标题大小
    new Setting(advancedContent)
      .setName('标题大小')
      .addSlider(slider => {
        slider.setLimits(8, 24, 1).setValue(field.titleFontSize).setDynamicTooltip()
          .onChange(async value => {
            if (this.plugin.settings.fields[index]) this.plugin.settings.fields[index]!.titleFontSize = value;
            await this.plugin.saveSettings();
            this.updateFieldPreview(cardPreview, this.plugin.settings.fields[index]!);
            this.updateFontPreview(fontPreview, this.plugin.settings.fields[index]!);
          });
      });

    // 正文字体
    new Setting(advancedContent)
      .setName('正文字体')
      .addDropdown(dropdown => {
        const fontOptions = [
          { value: 1, label: '手写风格' },
          { value: 2, label: '无衬线' },
          { value: 3, label: '等宽字体' },
          { value: 4, label: 'Comic Sans' },
        ];
        fontOptions.forEach(opt => dropdown.addOption(opt.value.toString(), opt.label));
        dropdown.setValue(field.metaFontFamily.toString())
          .onChange(async value => {
            if (this.plugin.settings.fields[index]) this.plugin.settings.fields[index]!.metaFontFamily = parseInt(value);
            await this.plugin.saveSettings();
            this.updateFieldPreview(cardPreview, this.plugin.settings.fields[index]!);
            this.updateFontPreview(fontPreview, this.plugin.settings.fields[index]!);
          });
      });

    // 正文大小
    new Setting(advancedContent)
      .setName('正文大小')
      .addSlider(slider => {
        slider.setLimits(8, 20, 1).setValue(field.metaFontSize).setDynamicTooltip()
          .onChange(async value => {
            if (this.plugin.settings.fields[index]) this.plugin.settings.fields[index]!.metaFontSize = value;
            await this.plugin.saveSettings();
            this.updateFieldPreview(cardPreview, this.plugin.settings.fields[index]!);
            this.updateFontPreview(fontPreview, this.plugin.settings.fields[index]!);
          });
      });

    // 卡片宽度
    new Setting(advancedContent)
      .setName('卡片宽度')
      .addSlider(slider => {
        slider.setLimits(150, 800, 10).setValue(field.cardWidth || 280).setDynamicTooltip()
          .onChange(async value => {
            if (this.plugin.settings.fields[index]) this.plugin.settings.fields[index]!.cardWidth = value;
            await this.plugin.saveSettings();
            this.updateFieldPreview(cardPreview, this.plugin.settings.fields[index]!);
            this.updateFontPreview(fontPreview, this.plugin.settings.fields[index]!);
          });
      });

    // 卡片高度
    new Setting(advancedContent)
      .setName('卡片高度')
      .addSlider(slider => {
        slider.setLimits(100, 600, 10).setValue(field.cardHeight || 180).setDynamicTooltip()
          .onChange(async value => {
            if (this.plugin.settings.fields[index]) this.plugin.settings.fields[index]!.cardHeight = value;
            await this.plugin.saveSettings();
            this.updateFieldPreview(cardPreview, this.plugin.settings.fields[index]!);
            this.updateFontPreview(fontPreview, this.plugin.settings.fields[index]!);
          });
      });

    // 标题对齐
    new Setting(advancedContent)
      .setName('标题对齐')
      .addDropdown(dropdown => {
        dropdown.addOption('left', '居左');
        dropdown.addOption('center', '居中');
        dropdown.setValue(field.titleAlignment || 'left')
          .onChange(async value => {
            if (this.plugin.settings.fields[index]) this.plugin.settings.fields[index]!.titleAlignment = value as 'left' | 'center';
            await this.plugin.saveSettings();
            this.updateFieldPreview(cardPreview, this.plugin.settings.fields[index]!);
            this.updateFontPreview(fontPreview, this.plugin.settings.fields[index]!);
          });
      });

    // ── 恢复默认按钮 ───────────────────────────────────────────────
    const resetContainer = controls.createDiv();
    resetContainer.style.marginTop = '12px';
    resetContainer.style.paddingTop = '12px';
    resetContainer.style.borderTop = '1px solid var(--background-modifier-border)';

    new Setting(resetContainer)
      .setName('重置样式')
      .setDesc('恢复此领域为默认样式')
      .addButton(btn => {
        btn
          .setButtonText('恢复默认')
          .setWarning()
          .onClick(async () => {
            // 找到默认领域中同名的设置
            const defaultField = DEFAULT_FIELDS.find(f => f.name === field.name);
            if (defaultField && this.plugin.settings.fields[index]) {
              Object.assign(this.plugin.settings.fields[index]!, defaultField);
              await this.plugin.saveSettings();
              this.display(); // 刷新页面
              new Notice('已恢复默认样式');
            }
          });
      });

  }

  updateFontPreview(preview: HTMLElement, field: FieldStyle): void {
    const fontFamilyMap: Record<number, string> = {
      1: 'Excalifont', // 手写风格
      2: 'Helvetica', // 无衬线
      3: 'Cascadia', // 等宽字体
      4: 'Comic', // Comic Sans
    };

    preview.style.background = field.backgroundColor;
    preview.style.color = field.metaTextColor || field.textColor;
    preview.innerHTML =
      '<div style="height: 100%;">' +
        '<div style="margin-bottom: 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">字体预览</div>' +
        '<div style="margin-bottom: 24px;">' +
          '<div style="font-size: ' + (field.titleFontSize || 14) + 'px; font-family: ' + fontFamilyMap[field.titleFontFamily] + '; color: ' + (field.titleTextColor || field.textColor) + '; margin-bottom: 8px; font-weight: 600; text-align: ' + (field.titleAlignment || 'left') + ';">' +
            '论文标题字体效果 Title Font Preview' +
          '</div>' +
          '<div style="font-size: ' + (field.metaFontSize || 11) + 'px; font-family: ' + fontFamilyMap[field.metaFontFamily] + '; color: ' + (field.metaTextColor || field.textColor) + '; opacity: 0.85;">' +
            '这是正文字体效果示例 · Meta Font Example · 作者名 · arXiv · 2024' +
          '</div>' +
        '</div>' +
        '<div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.2);">' +
          '<div style="font-size: 12px; margin-bottom: 8px; font-weight: 600;">字体设置信息</div>' +
          '<div style="font-size: 11px; opacity: 0.7;">' +
            '标题: ' + (field.titleFontSize || 14) + 'px · ' +
            '正文: ' + (field.metaFontSize || 11) + 'px' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  updateFieldPreview(preview: HTMLElement, field: FieldStyle): void {
    const roundnessMap: Record<number, string> = {
      0: '0px',
      1: '4px',
      2: '8px',
      3: '16px',
    };

    const fontFamilyMap: Record<number, string> = {
      1: 'Excalifont',
      2: 'Helvetica',
      3: 'Cascadia',
      4: 'Comic',
    };

    const scaleFactor = 0.4;
    const previewWidth = (field.cardWidth || 280) * scaleFactor;
    const previewHeight = (field.cardHeight || 180) * scaleFactor;

    preview.style.width = previewWidth + 'px';
    preview.style.height = previewHeight + 'px';
    preview.style.minWidth = previewWidth + 'px';
    preview.style.maxWidth = previewWidth + 'px';
    preview.style.minHeight = previewHeight + 'px';
    preview.style.maxHeight = previewHeight + 'px';
    preview.style.background = field.backgroundColor;
    preview.style.border = '2px solid ' + field.borderColor;
    preview.style.borderRadius = roundnessMap[field.roundness] || '8px';
    preview.style.opacity = (field.opacity / 100).toString();
    preview.style.transition = 'all 0.2s ease';
    preview.style.overflow = 'hidden';
    preview.style.display = 'flex';
    preview.style.alignItems = 'center';
    preview.style.justifyContent = 'center';

    if (field.roughness > 0) {
      preview.style.boxShadow = field.roughness + 'px ' + field.roughness + 'px 0 rgba(0,0,0,0.1)';
    } else {
      preview.style.boxShadow = 'none';
    }

    const scaledTitleFontSize = (field.titleFontSize || 14) * scaleFactor;
    const scaledMetaFontSize = (field.metaFontSize || 11) * scaleFactor;
    const scaledPadding = 16 * scaleFactor;
    const sizeText = (field.cardWidth || 280) + ' x ' + (field.cardHeight || 180) + 'px';

    preview.innerHTML =
      '<div style="color: ' + (field.titleTextColor || field.textColor) + '; padding: ' + scaledPadding + 'px; text-align: center; width: 100%;">' +
        '<strong style="font-size: ' + scaledTitleFontSize + 'px; font-family: ' + fontFamilyMap[field.titleFontFamily] + '; display: block; margin-bottom: ' + (8 * scaleFactor) + 'px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + field.name + '</strong>' +
        '<div style="font-size: ' + scaledMetaFontSize + 'px; font-family: ' + fontFamilyMap[field.metaFontFamily] + '; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">TITLE EXAMPLE</div>' +
        '<div style="margin-top: ' + (8 * scaleFactor) + 'px; font-size: ' + (10 * scaleFactor) + 'px; opacity: 0.6;">' + sizeText + '</div>' +
      '</div>';
  }

  addSectionHeader(containerEl: HTMLElement, text: string): void {
    const header = containerEl.createEl('h3', { text });
    header.style.marginTop = '24px';
    header.style.marginBottom = '12px';
    header.style.fontSize = '1.1em';
    header.style.fontWeight = '600';
    header.style.color = 'var(--text-normal)';
    header.style.letterSpacing = '-0.02em';
  }

  addSubHeader(containerEl: HTMLElement, text: string): void {
    const header = containerEl.createEl('h4', { text });
    header.style.marginTop = '16px';
    header.style.marginBottom = '8px';
    header.style.fontSize = '0.9em';
    header.style.fontWeight = '600';
    header.style.color = 'var(--text-muted)';
    header.style.textTransform = 'uppercase';
    header.style.letterSpacing = '0.05em';
  }

  addProminentSubHeader(containerEl: HTMLElement, text: string): void {
    const header = containerEl.createEl('h4', { text });
    header.style.marginTop = '20px';
    header.style.marginBottom = '12px';
    header.style.fontSize = '1.1em';
    header.style.fontWeight = '700';
    header.style.color = 'var(--text-normal)';
    header.style.textTransform = 'none';
    header.style.letterSpacing = '0em';
    header.style.display = 'block';
    header.style.width = '100%';
    header.style.gridColumn = '1 / -1';
  }
}

// 关联领域输入弹窗
class AliasInputModal extends Modal {
  private title: string;
  private description: string;
  private onSubmit: (value: string) => void;
  private inputValue: string = '';

  constructor(app: App, title: string, description: string, onSubmit: (value: string) => void) {
    super(app);
    this.title = title;
    this.description = description;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.title });

    new Setting(contentEl)
      .setName('关联领域名称')
      .setDesc(this.description)
      .addText(text => {
        text.setPlaceholder('输入领域名称');
        text.inputEl.style.width = '200px';
        text.onChange(v => {
          this.inputValue = v.trim();
        });
        setTimeout(() => text.inputEl.focus(), 100);
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            this.submit();
          }
        });
      });

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText('取消');
        btn.onClick(() => this.close());
      })
      .addButton(btn => {
        btn.setButtonText('添加');
        btn.setCta();
        btn.onClick(() => this.submit());
      });
  }

  private submit(): void {
    this.onSubmit(this.inputValue);
    this.close();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// 添加新领域模态框（支持复制已有样式）
class AddFieldModal extends Modal {
  private fields: FieldStyle[];
  private onSubmit: (field: FieldStyle) => void;
  private newFieldName: string = '';
  private copyFromIndex: number = -1; // -1 表示不复制（使用默认样式）
  private selectedPalette?: PaperPalette;

  constructor(app: App, fields: FieldStyle[], onSubmit: (field: FieldStyle) => void) {
    super(app);
    this.fields = fields;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: '添加新领域' });

    // 领域名称
    new Setting(contentEl)
      .setName('名称')
      .setDesc('输入新领域的名称')
      .addText(text => {
        text.setPlaceholder('例如：深度学习');
        text.inputEl.style.width = '200px';
        text.onChange(v => {
          this.newFieldName = v.trim();
        });
        setTimeout(() => text.inputEl.focus(), 100);
      });

    let refreshPalettes = () => {};
    // 样式来源下拉
    new Setting(contentEl)
      .setName('样式来源')
      .setDesc('选择默认样式或复制已有领域')
      .addDropdown(dropdown => {
        dropdown.addOption('-1', '默认样式');
        this.fields.forEach((field, index) => {
          dropdown.addOption(index.toString(), `复制: ${field.name}`);
        });
        dropdown.onChange(v => {
          this.copyFromIndex = parseInt(v);
          this.selectedPalette = undefined;
          refreshPalettes();
        });
      });

    const paletteSection = contentEl.createEl('details', { cls: 'pm-palette-custom' });
    paletteSection.createEl('summary', { text: '选择背景色（可选）' });
    const palettePicker = renderPalettePicker(paletteSection, {
      getCurrentColors: () => this.selectedPalette?.colors ?? this.fields[this.copyFromIndex] ?? {},
      onSelect: palette => { this.selectedPalette = palette; },
    });
    refreshPalettes = () => palettePicker.refresh();

    // 按钮
    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText('取消');
        btn.onClick(() => this.close());
      })
      .addButton(btn => {
        btn.setButtonText('创建');
        btn.setCta();
        btn.onClick(() => this.createField());
      });

    // 回车键支持
    const input = contentEl.querySelector('input[type="text"]') as HTMLInputElement;
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.createField();
      }
    });
  }

  private createField(): void {
    const fieldName = this.newFieldName || '新领域';

    // 检查名称是否已存在
    const allNames: string[] = [];
    this.fields.forEach(f => {
      allNames.push(f.name);
      if (f.aliases) allNames.push(...f.aliases);
    });

    if (allNames.includes(fieldName)) {
      new Notice('领域名称已存在，请使用其他名称');
      return;
    }

    let newField: FieldStyle;

    if (this.copyFromIndex >= 0 && this.fields[this.copyFromIndex]) {
      // 复制已有领域样式
      const sourceField = this.fields[this.copyFromIndex]!;
      newField = {
        name: fieldName,
        aliases: [], // 不复制关联领域
        backgroundColor: sourceField.backgroundColor,
        backgroundPattern: sourceField.backgroundPattern,
        patternColor: sourceField.patternColor,
        textColor: sourceField.textColor,
        titleTextColor: sourceField.titleTextColor,
        metaTextColor: sourceField.metaTextColor,
        borderColor: sourceField.borderColor,
        roughness: sourceField.roughness,
        opacity: sourceField.opacity,
        roundness: sourceField.roundness,
        titleFontSize: sourceField.titleFontSize,
        titleFontFamily: sourceField.titleFontFamily,
        metaFontSize: sourceField.metaFontSize,
        metaFontFamily: sourceField.metaFontFamily,
        cardWidth: sourceField.cardWidth,
        cardHeight: sourceField.cardHeight,
        titleAlignment: sourceField.titleAlignment,
      };
      new Notice(`已复制「${sourceField.name}」的样式创建新领域`);
    } else {
      // 使用默认样式
      newField = {
        name: fieldName,
        aliases: [],
        backgroundColor: '#ffffff',
        backgroundPattern: 'solid',
        patternColor: '#cccccc',
        textColor: '#000000',
        borderColor: '#000000',
        roughness: 0,
        opacity: 100,
        roundness: 2,
        titleFontSize: 14,
        titleFontFamily: 4,
        metaFontSize: 11,
        metaFontFamily: 4,
        cardWidth: 280,
        cardHeight: 180,
        titleAlignment: 'left',
        titleTextColor: undefined,
        metaTextColor: undefined,
      };
    }

    if (this.selectedPalette) applyPaperPalette(newField, this.selectedPalette);
    this.onSubmit(newField);
    this.close();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
