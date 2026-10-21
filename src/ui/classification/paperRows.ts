import { changed, displayFields, OrganizerDraft, PaperDraft, setMainField } from './model';

export interface PaperFilters { query: string; mode: string; source: string; page: number; }

export function renderPaperRows(container: HTMLElement, draft: OrganizerDraft, filters: PaperFilters, refresh: () => void): void {
  container.createEl('h3', { text: '逐篇确认分类' });
  const controls = container.createDiv({ cls: 'classification-filters' });
  const search = controls.createEl('input', { type: 'search', value: filters.query, attr: { placeholder: '搜索标题或标签', 'aria-label': '搜索论文' } });
  search.addEventListener('change', () => { filters.query = search.value; filters.page = 0; refresh(); });
  const mode = controls.createEl('select', { attr: { 'aria-label': '筛选状态' } });
  for (const [value, text] of [['all', '所有论文'], ['pending', '待确认'], ['changed', '仅看变更'], ['selected', '已勾选']]) mode.createEl('option', { value, text });
  mode.value = filters.mode;
  mode.addEventListener('change', () => { filters.mode = mode.value; filters.page = 0; refresh(); });
  const source = controls.createEl('select', { attr: { 'aria-label': '按原标签筛选' } });
  source.createEl('option', { value: '', text: '所有原标签' });
  source.createEl('option', { value: '__unclassified__', text: '原来未分类' });
  const oldLabels = [...new Set(draft.rows.reduce<string[]>((all, row) => all.concat(row.paper.fields), []))];
  oldLabels.forEach(label => source.createEl('option', { value: label, text: label }));
  source.value = filters.source;
  source.addEventListener('change', () => { filters.source = source.value; filters.page = 0; refresh(); });
  const query = filters.query.trim().toLocaleLowerCase();
  const filtered = draft.rows.filter(row => {
    const matches = `${row.paper.title} ${row.paper.fields.join(' ')} ${row.fields.join(' ')}`.toLocaleLowerCase().includes(query);
    const state = filters.mode === 'all' || (filters.mode === 'pending' && !row.selected) || (filters.mode === 'changed' && changed(row)) || (filters.mode === 'selected' && row.selected);
    const old = !filters.source || (filters.source === '__unclassified__' ? !row.paper.fields.length : row.paper.fields.includes(filters.source));
    return matches && state && old;
  });
  renderBatch(controls, draft, filtered, refresh);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  filters.page = Math.min(filters.page, pageCount - 1);
  const navigation = container.createDiv({ cls: 'classification-pagination' });
  navigation.createSpan({ text: `共 ${filtered.length} 篇 · 第 ${filters.page + 1} / ${pageCount} 页` });
  for (const [offset, title] of [[-1, '上一页'], [1, '下一页']] as const) {
    const button = navigation.createEl('button', { text: title });
    button.disabled = filters.page + offset < 0 || filters.page + offset >= pageCount;
    button.addEventListener('click', () => { filters.page += offset; refresh(); });
  }
  const list = container.createDiv({ cls: 'classification-paper-list' });
  if (!filtered.length) list.createEl('p', { text: '没有符合筛选条件的论文。' });
  filtered.slice(filters.page * 12, filters.page * 12 + 12).forEach(row => renderPaperRow(list, draft, row, refresh));
}

function renderBatch(container: HTMLElement, draft: OrganizerDraft, filtered: PaperDraft[], refresh: () => void): void {
  const actions = container.createDiv({ cls: 'classification-batch' });
  for (const [text, selected] of [['勾选筛选结果', true], ['取消筛选结果', false]] as const) {
    actions.createEl('button', { text }).addEventListener('click', () => { filtered.forEach(row => { row.selected = selected; }); refresh(); });
  }
  let main = draft.taxonomy[0]?.name || '';
  let sub = '';
  const mainSelect = actions.createEl('select', { attr: { 'aria-label': '批量主领域' } });
  draft.taxonomy.forEach(field => mainSelect.createEl('option', { value: field.name, text: field.name }));
  const subSelect = actions.createEl('select', { attr: { 'aria-label': '批量子领域' } });
  const updateSubs = () => {
    sub = ''; subSelect.empty(); subSelect.createEl('option', { value: '', text: '仅设置主领域' });
    draft.taxonomy.find(field => field.name === main)?.aliases?.forEach(label => subSelect.createEl('option', { value: label, text: label }));
  };
  updateSubs();
  mainSelect.addEventListener('change', () => { main = mainSelect.value; updateSubs(); });
  subSelect.addEventListener('change', () => { sub = subSelect.value; });
  actions.createEl('button', { text: '批量设置已勾选论文' }).addEventListener('click', () => {
    if (!main) return;
    filtered.filter(row => row.selected).forEach(row => {
      setMainField(row, main, draft.taxonomy);
      if (sub) row.fields = [main, sub, ...row.fields.slice(1).filter(label => label !== sub)];
    });
    refresh();
  });
}

function renderPaperRow(container: HTMLElement, draft: OrganizerDraft, row: PaperDraft, refresh: () => void): void {
  const item = container.createDiv({ cls: 'classification-paper-row' });
  const header = item.createEl('label', { cls: 'classification-paper-title' });
  const checkbox = header.createEl('input', { type: 'checkbox' });
  checkbox.checked = row.selected;
  checkbox.addEventListener('change', () => { row.selected = checkbox.checked; refresh(); });
  header.createSpan({ text: row.paper.title });
  item.createDiv({ cls: 'classification-before', text: `当前：${displayFields(row.paper.fields)}` });
  item.createDiv({ cls: 'classification-reason', text: `${row.confidence === 'low' ? '待确认 · ' : ''}${row.reason}` });
  const editor = item.createDiv({ cls: 'classification-row-editor' });
  const main = draft.taxonomy.find(field => field.name === row.fields[0]);
  const mainSelect = editor.createEl('select', { attr: { 'aria-label': `${row.paper.title}的主领域` } });
  mainSelect.createEl('option', { value: '', text: '选择主领域' });
  draft.taxonomy.forEach(field => mainSelect.createEl('option', { value: field.name, text: field.name }));
  mainSelect.value = main?.name || '';
  mainSelect.addEventListener('change', () => { if (mainSelect.value) setMainField(row, mainSelect.value, draft.taxonomy); refresh(); });
  const sub = row.fields.slice(1).find(label => main?.aliases?.includes(label)) || '';
  const subSelect = editor.createEl('select', { attr: { 'aria-label': `${row.paper.title}的子领域` } });
  subSelect.createEl('option', { value: '', text: '选择子领域（可选）' });
  main?.aliases?.forEach(label => subSelect.createEl('option', { value: label, text: label }));
  subSelect.value = sub;
  subSelect.disabled = !main;
  subSelect.addEventListener('change', () => {
    const extras = row.fields.slice(1).filter(label => label !== sub && label !== subSelect.value);
    row.fields = [main!.name, subSelect.value, ...extras].filter(Boolean);
    row.selected = true; row.reason = '已手动修改子领域'; refresh();
  });
  renderMethodTags(item, draft, row, main?.name || '', sub, refresh);
  item.createDiv({ cls: 'classification-after', text: `${changed(row) ? '草稿' : '保留'}：${displayFields(row.fields)}` });
  const reset = item.createEl('button', { text: '保留原分类', cls: 'classification-row-reset' });
  reset.addEventListener('click', () => { row.fields = [...row.paper.fields]; row.selected = false; row.reason = '保留当前分类'; refresh(); });
}

function renderMethodTags(container: HTMLElement, draft: OrganizerDraft, row: PaperDraft, main: string, sub: string, refresh: () => void): void {
  const extras = main ? row.fields.slice(1).filter(label => label !== sub) : row.fields;
  const details = container.createEl('details', { cls: 'classification-methods', attr: { 'data-section': `methods:${row.paper.path}` } });
  details.createEl('summary', { text: `方法／输入／训练标签 · 已选 ${extras.length} 个（点选，可多选）` });
  if (extras.length) details.createDiv({ cls: 'classification-selected-tags', text: extras.join(' · ') });
  const picker = details.createDiv({ cls: 'classification-tag-picker' });
  draft.taxonomy.forEach(field => {
    const available = [field.name, ...(field.aliases || [])].filter(label => label !== main && label !== sub);
    if (!available.length) return;
    const group = picker.createDiv({ cls: 'classification-tag-group' });
    group.createSpan({ text: field.name, cls: 'classification-tag-heading' });
    for (const label of available) {
      const selected = extras.includes(label);
      const button = group.createEl('button', { text: label, cls: selected ? 'is-selected' : '', attr: { 'aria-pressed': String(selected) } });
      button.addEventListener('click', () => {
        row.fields = selected ? row.fields.filter(value => value !== label) : [...row.fields, label];
        row.selected = true; row.reason = '已手动选择方法／输入／训练标签'; refresh();
      });
    }
  });
}
