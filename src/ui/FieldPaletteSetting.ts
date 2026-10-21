import { ColorComponent, Notice, Setting } from 'obsidian';
import { FieldStyle } from '../types';
import { applyPaperPalette } from '../utils/colorPalettes';
import { renderPalettePicker } from './PalettePicker';

type EditableColor = 'backgroundColor' | 'borderColor' | 'titleTextColor' | 'metaTextColor';

interface FieldPaletteOptions {
  field: FieldStyle;
  save: () => Promise<void>;
  onChanged: () => void;
}

/** Keep palette selection and optional individual color pickers in sync. */
export function renderFieldPaletteSetting(container: HTMLElement, options: FieldPaletteOptions): void {
  const { field } = options;
  const inputs: Array<{ key: EditableColor; picker: ColorComponent }> = [];
  const refreshInputs = () => {
    inputs.forEach(({ key, picker }) => picker.setValue(field[key] || field.textColor));
    options.onChanged();
  };
  const palettes = renderPalettePicker(container, {
    getCurrentColors: () => field,
    onSelect: async palette => {
      const previous = field.backgroundColor;
      applyPaperPalette(field, palette);
      refreshInputs();
      try {
        await options.save();
      } catch (error) {
        field.backgroundColor = previous;
        refreshInputs();
        throw error;
      }
    },
  });

  const custom = container.createEl('details', { cls: 'pm-palette-custom' });
  custom.createEl('summary', { text: '微调单个颜色（可选）' });
  const customControls = custom.createDiv({ cls: 'pm-palette-custom-controls' });
  const colors: Array<{ key: EditableColor; label: string }> = [
    { key: 'backgroundColor', label: '背景色' },
    { key: 'borderColor', label: '边框色' },
    { key: 'titleTextColor', label: '标题颜色' },
    { key: 'metaTextColor', label: '正文颜色' },
  ];
  for (const { key, label } of colors) {
    new Setting(customControls).setName(label).addColorPicker(picker => {
      inputs.push({ key, picker });
      picker.setValue(field[key] || field.textColor).onChange(async value => {
        const previous = field[key];
        Object.assign(field, { [key]: value });
        refreshInputs();
        palettes.refresh();
        try {
          await options.save();
        } catch {
          Object.assign(field, { [key]: previous });
          refreshInputs();
          palettes.refresh();
          new Notice('颜色保存失败，请重试。');
        }
      });
    });
  }
}
