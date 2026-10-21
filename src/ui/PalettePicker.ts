import { Notice } from 'obsidian';
import { PAPER_PALETTES, PaperPalette } from '../utils/colorPalettes';

interface PalettePickerOptions {
  getCurrentColors: () => Partial<PaperPalette['colors']>;
  onSelect: (palette: PaperPalette) => void | Promise<void>;
}

type PaletteFilter = 'all' | PaperPalette['mode'];

function normalizeColor(color: string | undefined): string {
  const normalized = color?.trim().toLowerCase() ?? '';
  return /^#[\da-f]{3}$/.test(normalized)
    ? '#' + normalized.slice(1).split('').map(character => character + character).join('')
    : normalized;
}

export function renderPalettePicker(
  container: HTMLElement,
  options: PalettePickerOptions,
): { refresh: () => void } {
  const root = container.createDiv({ cls: 'pm-palette-picker' });
  root.createDiv({ cls: 'pm-palette-heading', text: `背景色 · ${PAPER_PALETTES.length} 色` });
  const toolbar = root.createDiv({ cls: 'pm-palette-toolbar' });
  const filters = toolbar.createDiv({
    cls: 'pm-palette-filters',
    attr: { role: 'group', 'aria-label': '背景明暗' },
  });
  const status = toolbar.createSpan({
    cls: 'pm-palette-status',
    attr: { role: 'status', 'aria-live': 'polite' },
  });
  const searchInput = root.createEl('input', {
    cls: 'pm-palette-search',
    attr: { type: 'search', placeholder: '搜索色卡名称或来源', 'aria-label': '搜索色卡名称或来源' },
  });
  const grid = root.createDiv({ cls: 'pm-palette-grid' });
  const empty = root.createDiv({ cls: 'pm-palette-empty', text: '没有匹配的色卡' });
  let currentFilter: PaletteFilter = 'all';
  let selectingId: string | null = null;
  const filterButtons: Array<{ filter: PaletteFilter; button: HTMLButtonElement }> = [];
  const cards: Array<{
    palette: PaperPalette;
    item: HTMLElement;
    button: HTMLButtonElement;
    badge: HTMLElement;
  }> = [];

  const refresh = (): void => {
    const currentColors = options.getCurrentColors();
    let selectedName = '';
    let visibleCount = 0;
    const query = searchInput.value.trim().toLocaleLowerCase();
    for (const { palette, item, button, badge } of cards) {
      const selected = normalizeColor(currentColors.backgroundColor)
        === normalizeColor(palette.colors.backgroundColor);
      if (selected) selectedName = palette.name;
      item.hidden = (currentFilter !== 'all' && palette.mode !== currentFilter)
        || !`${palette.name} ${palette.sourceName}`.toLocaleLowerCase().includes(query);
      if (!item.hidden) visibleCount++;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = selectingId !== null;
      badge.textContent = selectingId === palette.id ? '…' : selected ? '✓' : '';
    }
    for (const { filter, button } of filterButtons) {
      button.setAttribute('aria-pressed', String(filter === currentFilter));
      button.disabled = selectingId !== null;
    }
    root.setAttribute('aria-busy', String(selectingId !== null));
    empty.hidden = visibleCount > 0;
    status.textContent = selectingId !== null
      ? '正在应用背景色…'
      : selectedName ? `当前：${selectedName}` : '当前：自定义背景色';
  };
  searchInput.addEventListener('input', refresh);

  const selectPalette = async (palette: PaperPalette): Promise<void> => {
    if (selectingId !== null) return;
    selectingId = palette.id;
    refresh();
    try {
      await options.onSelect(palette);
    } catch {
      new Notice('背景色保存失败，请重试');
    } finally {
      selectingId = null;
      refresh();
    }
  };

  for (const [filter, label] of [
    ['all', '全部'], ['light', '浅色'], ['dark', '深色'],
  ] as const) {
    const button = filters.createEl('button', {
      cls: 'pm-palette-filter',
      text: `${label} ${filter === 'all' ? PAPER_PALETTES.length : PAPER_PALETTES.filter(p => p.mode === filter).length}`,
      attr: { type: 'button' },
    });
    button.addEventListener('click', () => {
      currentFilter = filter;
      refresh();
    });
    filterButtons.push({ filter, button });
  }

  for (const palette of PAPER_PALETTES) {
    const item = grid.createDiv({ cls: 'pm-palette-item' });
    const button = item.createEl('button', {
      cls: 'pm-palette-card',
      attr: {
        type: 'button', 'aria-label': `选择${palette.name}背景色`,
        title: `${palette.name} · ${palette.sourceName} · ${palette.mode === 'light' ? '浅色' : '深色'}`,
      },
    });
    button.createSpan({ cls: 'pm-palette-name', text: palette.name });
    const swatches = button.createSpan({
      cls: 'pm-palette-swatches', attr: { 'aria-hidden': 'true' },
    });
    swatches.style.backgroundColor = palette.colors.backgroundColor;
    const badge = button.createSpan({ cls: 'pm-palette-badge', attr: { 'aria-hidden': 'true' } });
    button.addEventListener('click', () => { void selectPalette(palette); });
    cards.push({ palette, item, button, badge });
  }

  const sources = root.createDiv({ cls: 'pm-palette-sources' });
  sources.createSpan({ text: '颜色来源：' });
  for (const [name, url] of new Map(PAPER_PALETTES.map(palette => [palette.sourceName, palette.sourceUrl]))) {
    sources.createEl('a', {
      text: name, href: url,
      attr: { target: '_blank', rel: 'noopener noreferrer' },
    });
  }

  refresh();
  return { refresh };
}

export function renderPaletteSwatches(
  container: HTMLElement,
  options: {
    getCurrentColor: () => string;
    onSelect: (color: string) => void | Promise<void>;
  },
): { refresh: () => void } {
  const root = container.createDiv({
    cls: 'pm-palette-color-options',
    attr: { role: 'group', 'aria-label': '选择标签颜色' },
  });
  const swatches: Array<{ color: string; button: HTMLButtonElement }> = [];
  let selecting = false;
  const refresh = (): void => {
    for (const { color, button } of swatches) {
      const selected = normalizeColor(color) === normalizeColor(options.getCurrentColor());
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-selected', selected);
      button.disabled = selecting;
    }
  };
  const selectColor = async (color: string): Promise<void> => {
    if (selecting) return;
    selecting = true;
    refresh();
    try {
      await options.onSelect(color);
    } catch {
      new Notice('颜色保存失败，请重试');
    } finally {
      selecting = false;
      refresh();
    }
  };
  const seen = new Set<string>();
  for (const palette of PAPER_PALETTES) {
    const color = palette.colors.backgroundColor;
    if (seen.has(normalizeColor(color))) continue;
    seen.add(normalizeColor(color));
    const button = root.createEl('button', {
      cls: 'pm-palette-color-option',
      attr: { type: 'button', title: palette.name, 'aria-label': palette.name },
    });
    button.style.backgroundColor = color;
    button.addEventListener('click', () => { void selectColor(color); });
    swatches.push({ color, button });
  }
  refresh();
  return { refresh };
}
