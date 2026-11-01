/** Accessible tabs (WAI-ARIA pattern): click, Arrow keys (RTL-aware), Home/End. */
export function setupTabs(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.js-tabs').forEach((box) => {
    const tabs = Array.from(box.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const select = (t: HTMLButtonElement, focus = false) => {
      tabs.forEach((x) => {
        const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
        const p = document.getElementById(x.getAttribute('aria-controls') || ''); if (p) p.hidden = !on;
      });
      if (focus) t.focus();
      t.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const rtl = getComputedStyle(box).direction === 'rtl';
        const next = rtl ? 'ArrowLeft' : 'ArrowRight'; const prev = rtl ? 'ArrowRight' : 'ArrowLeft';
        let j = -1;
        if (e.key === next) j = (i + 1) % tabs.length; else if (e.key === prev) j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = tabs.length - 1;
        if (j >= 0) { e.preventDefault(); select(tabs[j], true); }
      });
    });
  });
}
