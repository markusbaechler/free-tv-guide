type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined>;

/** Kleiner Element-Builder. Text wird immer als Text gesetzt (kein innerHTML → kein Einschleusen von Markup). */
export function h(tag: string, attrs?: Attrs | null, ...children: Array<Child | Child[]>): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Array<Child | Child[]>): void {
  for (const c of children) {
    if (Array.isArray(c)) append(el, c);
    else if (c === null || c === undefined || c === false) continue;
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
