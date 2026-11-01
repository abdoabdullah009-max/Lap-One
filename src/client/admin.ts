// Admin helpers: confirmation for destructive actions, print, double-submit guard.
document.addEventListener('submit', (e) => {
  const f = e.target as HTMLFormElement;
  const btn = (e as SubmitEvent).submitter as HTMLElement | null;
  const msg = btn?.dataset.confirm || f.dataset.confirm;
  if (msg && !window.confirm(msg)) { e.preventDefault(); return; }
  if (f.dataset.sent) { e.preventDefault(); return; }
  f.dataset.sent = '1'; setTimeout(() => delete f.dataset.sent, 4000);
});
document.querySelector('[data-print]')?.addEventListener('click', () => window.print());
