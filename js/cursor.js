// =============================================================
//  cursor.js — custom "mission control" cursor
//    • a teal dot that follows the mouse exactly
//    • a ring that glides after it (smooth lag)
//    • over the globe the ring becomes a rotating targeting reticle
//    • over buttons/links it grows and glows; over text fields the
//      normal text cursor comes back so typing still feels right
//  Turned off automatically on touch screens and for people who
//  prefer reduced motion (they keep the normal cursor).
// =============================================================
export function initCursor() {
  const fine = window.matchMedia('(pointer: fine)').matches;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || calm) return;

  const root = document.documentElement;
  const cur = document.createElement('div');
  cur.id = 'cursor';
  cur.setAttribute('aria-hidden', 'true');
  cur.innerHTML = '<span class="c-ring"><i></i></span><span class="c-dot"></span>';
  document.body.append(cur);
  const ring = cur.querySelector('.c-ring'), dot = cur.querySelector('.c-dot');
  root.classList.add('has-cursor');

  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, shown = false;
  const LINK = 'button, a, summary, select, label, [role="button"], .fp, .pin-chip, input[type="range"], input[type="checkbox"]';
  const TEXT = 'input[type="text"], input[type="search"], input:not([type]), textarea, pre, [contenteditable="true"]';

  addEventListener('mousemove', (e) => {
    x = e.clientX; y = e.clientY;
    if (!shown) { rx = x; ry = y; shown = true; cur.classList.add('show'); }
    const t = e.target;
    const onText = !!t.closest?.(TEXT);
    cur.classList.toggle('text', onText);
    cur.classList.toggle('link', !onText && !!t.closest?.(LINK));
    cur.classList.toggle('globe', !onText && !!t.closest?.('#globe'));
  }, { passive: true });
  addEventListener('mousedown', () => cur.classList.add('down'));
  addEventListener('mouseup', () => cur.classList.remove('down'));
  document.addEventListener('mouseleave', () => { cur.classList.remove('show'); shown = false; });

  let last = performance.now();
  (function loop(now = performance.now()) {
    // frame-rate independent smoothing: same feel at 30, 60 or 144 fps
    const k = 1 - Math.exp(-(now - last) / 70);
    last = now;
    rx += (x - rx) * k;
    ry += (y - ry) * k;
    dot.style.transform = `translate(${x}px, ${y}px)`;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    requestAnimationFrame(loop);
  })();
}
