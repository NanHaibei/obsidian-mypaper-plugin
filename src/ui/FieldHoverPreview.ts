import { Component } from 'obsidian';

interface PreviewField {
  name: string;
  background?: string;
  color?: string;
}

interface PreviewRow {
  item: HTMLElement;
  trigger: HTMLElement;
  fields: PreviewField[];
  overlay?: HTMLElement;
  rail?: HTMLElement;
}

/** Delegated listeners survive rerenders without retaining detached paper rows. */
export class FieldHoverPreview extends Component {
  private rows = new WeakMap<HTMLElement, PreviewRow>();
  private active?: PreviewRow;

  constructor(private doc: Document) { super(); }

  add(trigger: HTMLElement, fields: PreviewField[]): void {
    const item = trigger.closest<HTMLElement>('.pm-paper-item, .pm-field-paper-item');
    if (!item) return;
    trigger.addClass('pm-field-preview-trigger');
    trigger.tabIndex = 0;
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-label', '查看全部领域');
    trigger.setAttribute('aria-expanded', 'false');
    this.rows.set(item, { item, trigger, fields });
  }

  onload(): void {
    this.registerDomEvent(this.doc, 'pointerover', event => {
      const row = this.triggerRow(event.target);
      if (row) this.open(row);
      else if (this.active && !this.contains(this.active.item, event.target)) this.close();
    });
    this.registerDomEvent(this.doc, 'pointerout', event => {
      if (this.active && !this.contains(this.active.item, event.relatedTarget)) this.close();
    });
    this.registerDomEvent(this.doc, 'focusin', event => {
      const row = this.triggerRow(event.target);
      if (row) this.open(row);
    });
    this.registerDomEvent(this.doc, 'focusout', event => {
      if (this.active && !this.contains(this.active.item, event.relatedTarget)) this.close();
    });
    this.registerDomEvent(this.doc, 'keydown', event => {
      if (event.key === 'Escape' && this.active) {
        this.close();
        event.stopPropagation();
      } else if (event.key === 'Enter' || event.key === ' ') {
        const row = this.triggerRow(event.target);
        if (row) { event.preventDefault(); this.open(row); }
      }
    });
    this.registerDomEvent(this.doc, 'click', event => {
      const row = this.triggerRow(event.target);
      if (row) { this.open(row); event.stopPropagation(); }
      else if (this.active?.overlay && this.contains(this.active.overlay, event.target)) event.stopPropagation();
      else this.close();
    }, true);
    this.registerDomEvent(this.doc, 'wheel', event => {
      const rail = this.active?.rail;
      if (!rail || !this.contains(rail, event.target) || event.ctrlKey || event.shiftKey || event.deltaX) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1);
      const canScroll = delta > 0 ? rail.scrollLeft < rail.scrollWidth - rail.clientWidth - 1 : rail.scrollLeft > 0;
      if (canScroll) { event.preventDefault(); rail.scrollLeft += delta; }
    }, { passive: false });
    this.register(() => this.close());
  }

  close(): void {
    if (!this.active) return;
    this.active.item.removeClass('pm-fields-preview-open');
    this.active.trigger.setAttribute('aria-expanded', 'false');
    if (this.active.overlay) this.active.overlay.hidden = true;
    this.active = undefined;
  }

  private open(row: PreviewRow): void {
    if (row === this.active) return;
    this.close();
    if (!row.overlay) {
      row.overlay = row.item.createDiv({ cls: 'pm-fields-preview' });
      row.rail = row.overlay.createDiv({
        cls: 'pm-fields-preview-rail',
        attr: { role: 'group', 'aria-label': '全部领域，可左右滚动', tabindex: '0' },
      });
      row.fields.forEach((field, index) => {
        const tag = row.rail!.createSpan({
          cls: `pm-fields-preview-tag${index === 0 ? ' is-main' : ''}`,
          text: field.name,
        });
        if (field.background) tag.style.backgroundColor = field.background;
        if (field.color) tag.style.color = field.color;
      });
    }
    this.active = row;
    row.overlay.hidden = false;
    row.rail!.scrollLeft = 0;
    row.item.addClass('pm-fields-preview-open');
    row.trigger.setAttribute('aria-expanded', 'true');
  }

  private triggerRow(target: EventTarget | null): PreviewRow | undefined {
    const trigger = (target as Element | null)?.closest?.('.pm-field-preview-trigger');
    const item = trigger?.closest<HTMLElement>('.pm-paper-item, .pm-field-paper-item');
    const row = item && this.rows.get(item);
    return row && row.trigger === trigger ? row : undefined;
  }

  private contains(container: HTMLElement, target: EventTarget | null): boolean {
    return !!target && 'nodeType' in target && container.contains(target as Node);
  }
}
