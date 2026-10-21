import { Notice, Setting } from 'obsidian';
import { labels, mergeMainFields, migrateLabel, newField, OrganizerDraft, splitLabels } from './model';

export function renderDomainEditor(container: HTMLElement, draft: OrganizerDraft, refresh: () => void): void {
  const details = container.createEl('details', { cls: 'classification-domains', attr: { 'data-section': 'domains' } });
  details.createEl('summary', { text: `编辑领域结构 · ${draft.taxonomy.length} 个主领域` });
  details.createEl('p', { cls: 'setting-item-description', text: '主领域按研究任务组织；子领域细分具体方法、输入和训练方式，一篇论文可选多个标签。名称不能重复。修改主领域名会同步到论文草稿；修改子领域名后，可在下方迁移旧标签。删除或合并前先迁移仍在使用的标签。' });
  for (const field of draft.taxonomy) {
    const row = details.createDiv({ cls: 'classification-domain-row' });
    const name = row.createEl('input', { type: 'text', value: field.name, attr: { placeholder: 'e.g. Locomotion' } });
    name.setAttribute('aria-label', '主领域名称');
    name.addEventListener('change', () => {
      const before = field.name;
      const after = name.value.trim();
      if (!after || (after !== before && labels(draft.taxonomy).includes(after))) {
        name.value = before;
        new Notice(after ? '领域名称已存在，请使用下方合并功能。' : '主领域名称不能为空。');
        return;
      }
      field.name = after;
      migrateLabel(draft, before, after);
      refresh();
    });
    const aliases = row.createEl('textarea', { text: (field.aliases || []).join(', '), attr: { rows: '2', placeholder: 'e.g. Heightmap, Depth, PPO', 'aria-label': `${field.name}的子领域` } });
    aliases.addEventListener('change', () => {
      const next = splitLabels(aliases.value);
      const otherLabels = new Set([field.name, ...labels(draft.taxonomy.filter(item => item !== field))]);
      const duplicate = next.find(label => otherLabels.has(label));
      if (duplicate) {
        aliases.value = (field.aliases || []).join(', ');
        new Notice(`「${duplicate}」已被其他领域使用，请使用迁移或合并功能。`);
        return;
      }
      field.aliases = next;
      refresh();
    });
    const remove = row.createEl('button', { text: '删除', cls: 'mod-warning' });
    remove.addEventListener('click', () => {
      draft.taxonomy.splice(draft.taxonomy.indexOf(field), 1);
      if (draft.defaultField === field.name) draft.defaultField = draft.taxonomy[0]?.name || '';
      refresh();
    });
  }
  new Setting(details).setName('新增主领域').addText(text => text.setPlaceholder('e.g. Locomotion').inputEl.addClass('classification-new-domain'))
    .addButton(button => button.setButtonText('添加').onClick(() => {
      const input = details.querySelector<HTMLInputElement>('.classification-new-domain');
      const name = input?.value.trim();
      if (!name) return;
      if (labels(draft.taxonomy).includes(name)) { new Notice('领域名称已存在。'); return; }
      draft.taxonomy.push(newField(name, draft.taxonomy[0]));
      refresh();
    }));
  new Setting(details).setName('默认主领域').addDropdown(dropdown => {
    draft.taxonomy.forEach(field => dropdown.addOption(field.name, field.name));
    dropdown.setValue(draft.defaultField).onChange(value => { draft.defaultField = value; refresh(); });
  });
  if (draft.taxonomy.length > 1) {
    let from = draft.taxonomy[0]!.name;
    let to = draft.taxonomy[1]!.name;
    new Setting(details).setName('合并主领域').setDesc('保留两者的子领域，把原主领域下的论文迁移到目标主领域并勾选。')
      .addDropdown(dropdown => {
        draft.taxonomy.forEach(field => dropdown.addOption(field.name, field.name));
        dropdown.setValue(from).onChange(value => { from = value; });
      }).addDropdown(dropdown => {
        draft.taxonomy.forEach(field => dropdown.addOption(field.name, field.name));
        dropdown.setValue(to).onChange(value => { to = value; });
      }).addButton(button => button.setButtonText('合并到草稿').onClick(() => { mergeMainFields(draft, from, to); refresh(); }));
  }
  const allOldLabels = [...new Set(draft.rows.reduce<string[]>((all, row) => all.concat(row.fields), []))];
  let source = allOldLabels[0] || '';
  let target = labels(draft.taxonomy)[0] || '';
  new Setting(details).setName('迁移或合并标签').setDesc('将使用旧标签的论文加入勾选；原标签随后可从结构中删除。')
    .addDropdown(dropdown => {
      allOldLabels.forEach(label => dropdown.addOption(label, label));
      dropdown.onChange(value => { source = value; });
    }).addDropdown(dropdown => {
      labels(draft.taxonomy).forEach(label => dropdown.addOption(label, label));
      dropdown.onChange(value => { target = value; });
    }).addButton(button => button.setButtonText('迁移到草稿').onClick(() => { migrateLabel(draft, source, target); refresh(); }));
}
