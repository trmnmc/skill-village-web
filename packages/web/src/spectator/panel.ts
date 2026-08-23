// packages/web/src/spectator/panel.ts
import type { PanelModel } from './copy.js';

/**
 * Renders a PanelModel into #side-panel. All decisions live in panelModel();
 * this is the last inch, and it only draws.
 */
export function createSpectatorPanel(options: { onToggle?(open: boolean): void } = {}): {
  open(model: PanelModel): void;
  close(): void;
} {
  const root = document.getElementById('side-panel')!;

  function close(): void {
    root.hidden = true;
    root.replaceChildren();
    options.onToggle?.(false);
  }

  function el(tag: string, style: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    node.setAttribute('style', style);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function open(model: PanelModel): void {
    root.replaceChildren();

    const header = document.createElement('header');
    header.append(el('div', '', model.header));
    const x = el('button', 'border:0;background:none;font-size:20px;cursor:pointer;color:#3A2E22;', '×');
    x.addEventListener('click', close);
    header.append(x);
    root.append(header);

    const body = el('div', 'padding:14px;overflow-y:auto;flex:1;');
    if (model.chip) {
      body.append(el('div',
        model.chipAccent
          ? 'display:inline-block;border:2px solid #D97757;color:#B4552F;padding:2px 8px;font-size:11px;margin-bottom:8px;'
          : 'display:inline-block;border:2px solid #3A2E22;padding:2px 8px;font-size:11px;margin-bottom:8px;',
        model.chip));
    }
    body.append(el('div', "font-family:'Pixelify Sans',sans-serif;font-size:24px;margin-bottom:6px;", model.title));
    body.append(el('div', 'margin-bottom:8px;', model.desc));
    body.append(el('div', 'opacity:0.7;font-size:12px;margin-bottom:10px;', model.meta));
    if (model.trivia) {
      body.append(el('div', 'background:#F2E5C4;border:1.5px solid #3A2E22;padding:6px 9px;font-size:12px;margin-bottom:10px;', model.trivia));
    }
    if (model.links.length > 0) {
      const row = el('div', 'margin-bottom:12px;');
      model.links.forEach((link, i) => {
        if (i > 0) row.append(' · ');
        const a = document.createElement('a');
        a.href = link.href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = link.label;
        row.append(a);
      });
      body.append(row);
    }
    for (const box of model.boxes) {
      body.append(el('div', 'border:2px solid #3A2E22;background:#F2E5C4;padding:9px 11px;font-size:12px;margin-bottom:10px;', box));
    }
    if (model.footnote) body.append(el('div', 'font-size:11px;opacity:0.7;', model.footnote));
    root.append(body);

    root.hidden = false;
    options.onToggle?.(true);
  }

  return { open, close };
}
