// Räumliche Navigation für die Fernbedienung.
// Fokussierbar ist jedes Element mit [data-nav]. Container mit [data-nav-group] merken sich
// das zuletzt fokussierte Element, damit man beim Zurückwechseln an derselben Stelle landet.

export type Dir = 'up' | 'down' | 'left' | 'right';

let current: HTMLElement | null = null;
const lastInGroup: Record<string, string> = {};

function groupOf(el: Element): HTMLElement | null {
  return el.closest('[data-nav-group]') as HTMLElement | null;
}

function visible(el: HTMLElement): boolean {
  if (el.offsetParent === null) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function focusables(root: ParentNode = document): HTMLElement[] {
  const list = root.querySelectorAll('[data-nav]');
  const out: HTMLElement[] = [];
  for (let i = 0; i < list.length; i++) {
    const el = list[i] as HTMLElement;
    if (visible(el)) out.push(el);
  }
  return out;
}

export function getFocused(): HTMLElement | null {
  return current && document.body.contains(current) ? current : null;
}

/** Scrollt das nächste [data-scroll]-Elternelement so, dass el ganz sichtbar ist */
function ensureVisible(el: HTMLElement): void {
  const box = el.closest('[data-scroll]') as HTMLElement | null;
  if (!box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const margin = 48;
  if (r.top < b.top + margin) box.scrollTop -= b.top + margin - r.top;
  else if (r.bottom > b.bottom - margin) box.scrollTop += r.bottom - (b.bottom - margin);
  // Erstes Element einer Liste: ganz nach oben, damit die Tagesüberschrift sichtbar bleibt
  if (el.hasAttribute('data-first')) box.scrollTop = 0;
}

export function setFocus(el: HTMLElement | null): void {
  if (current) current.classList.remove('is-focused');
  current = el;
  if (!el) return;
  el.classList.add('is-focused');
  const g = groupOf(el);
  const key = el.getAttribute('data-key');
  if (g && key) lastInGroup[g.getAttribute('data-nav-group')!] = key;
  ensureVisible(el);
}

export function findByKey(key: string, root: ParentNode = document): HTMLElement | null {
  const els = focusables(root);
  for (const el of els) if (el.getAttribute('data-key') === key) return el;
  return null;
}

/** Zuletzt fokussiertes Element einer Gruppe, sonst das erste */
export function focusGroup(name: string): boolean {
  const g = document.querySelector('[data-nav-group="' + name + '"]');
  if (!g) return false;
  const remembered = lastInGroup[name] ? findByKey(lastInGroup[name]!, g) : null;
  const target = remembered || focusables(g)[0] || null;
  if (target) setFocus(target);
  return !!target;
}

export function forgetGroup(name: string): void {
  delete lastInGroup[name];
}

/** Bestes Ziel in Richtung dir: nah in Blickrichtung, wenig seitlicher Versatz */
export function move(dir: Dir, root: ParentNode = document): boolean {
  const from = getFocused();
  const all = focusables(root);
  if (!from) {
    if (all[0]) setFocus(all[0]);
    return !!all[0];
  }
  const a = from.getBoundingClientRect();
  // Hoch/runter bleibt in der eigenen Spalte (Gruppe); nur wenn dort nichts mehr kommt, darf es hinaus.
  // Ausnahme: das Ende einer Liste – dann bleibt der Fokus stehen statt in eine Nachbarspalte zu springen.
  const fromGroup = groupOf(from);
  if ((dir === 'up' || dir === 'down') && fromGroup) {
    const same = all.filter((el) => groupOf(el) === fromGroup);
    const inGroup = pick(dir, from, a, same);
    if (inGroup) {
      setFocus(inGroup);
      return true;
    }
    // Gruppe nur senkrecht verlassen: Ziel muss darüber/darunter liegen und horizontal überlappen
    // (verhindert den Sprung vom Listenende in die Filterspalte)
    const outside = all.filter((el) => {
      if (groupOf(el) === fromGroup) return false;
      const b = el.getBoundingClientRect();
      const vertical = dir === 'up' ? b.bottom <= a.top + 1 : b.top >= a.bottom - 1;
      const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0;
      return vertical && overlap;
    });
    const target = pick(dir, from, a, outside);
    if (target) {
      enter(target, from);
      return true;
    }
    return false;
  }
  // Links/rechts: zuerst Ziele auf gleicher Höhe (Raster-Zeile), sonst irgendwo in der Richtung
  const sameRow = all.filter((el) => {
    if (el === from) return false;
    const b = el.getBoundingClientRect();
    return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
  });
  // Gibt es auf dieser Höhe andere Ziele, aber keins in Richtung dir → stehen bleiben (Rasterrand)
  const best = pick(dir, from, a, sameRow) || (sameRow.length ? null : pick(dir, from, a, all));
  if (!best) return false;
  enter(best, from);
  return true;
}

/** Fokus setzen; beim Wechsel in eine andere Gruppe dort an der gemerkten Stelle landen */
function enter(best: HTMLElement, from: HTMLElement): void {
  const gFrom = groupOf(from);
  const gTo = groupOf(best);
  if (gTo && gTo !== gFrom && gTo.getAttribute('data-nav-memory') !== 'off') {
    const name = gTo.getAttribute('data-nav-group')!;
    const remembered = lastInGroup[name] ? findByKey(lastInGroup[name]!, gTo) : null;
    if (remembered) best = remembered;
  }
  setFocus(best);
}

function pick(dir: Dir, from: HTMLElement, a: ClientRect, all: HTMLElement[]): HTMLElement | null {
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of all) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    let primary: number;
    let secondary: number;
    if (dir === 'up' || dir === 'down') {
      primary = dir === 'down' ? b.top - a.bottom : a.top - b.bottom;
      if (primary < -a.height / 2) continue;
      // seitlicher Abstand 0, wenn sich die Spalten überlappen
      secondary = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      if (secondary === 0) secondary = Math.abs(ax - (b.left + b.width / 2)) / 10;
    } else {
      primary = dir === 'right' ? b.left - a.right : a.left - b.right;
      if (primary < -a.width / 2) continue;
      secondary = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      if (secondary === 0) secondary = Math.abs(ay - (b.top + b.height / 2)) / 10;
    }
    const score = Math.max(0, primary) + secondary * 3;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}
