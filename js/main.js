// =============================================================
//  main.js — wires everything together
// =============================================================
import { CONFIG, styleFor } from './config.js';
import { initGeo, countryAt, formatCoord, oceanName, countryCentroid } from './geo.js';
import { getCheck } from './data.js';
import { loadData, getManifest, getProblems, isDemo, getGrid, getSeries, hotspots, countryRanking, getVariable, mapTrendValue, trendDisplay, trendForCell } from './data.js';
import { initGlobe, setLayer, flyTo, setSelection, clearSelection, setPins, autoRotate, getLegend, setOverlayOpacity, setHighlight } from './globe.js';
import { initPanel, renderPanel, closePanel, updateYearMarker } from './panel.js';
import { initSearch, search, nearestNamed } from './search.js';
import { startTour, stopTour, isTouring, typeInto } from './tour.js';
import { ramp, fmt, signed, el, toast } from './util.js';
import { copy } from './exporter.js';
import { icon, PLAY, PAUSE } from './icons.js';
import { openCaseStudy, renderValidation } from './casestudy.js';
import { renderGlobalFigures } from './globalfig.js';
import { initGlossary } from './glossary.js';
import { zScores, ANOMALY_Z, anomalyWord } from './anomaly.js';
import { answer, resetFocus } from './assistant.js';
import { initCursor } from './cursor.js';
import { renderJourney } from './journey.js';

const $ = (id) => document.getElementById(id);
const S = {
  variable: null,
  mode: 'trend', // 'trend' | 'year'
  year: null,
  place: null,
  pins: [],
  playing: null,
  scope: 'point',     // 'point' = one grid cell | 'country' = whole-country average
  hsMode: 'country',  // hotspots list: countries or regions
};

boot().catch((e) => {
  console.error(e);
  $('loader-text').textContent = 'Something went wrong while loading — open the browser console (F12) for details.';
});

async function boot() {
  progress('Loading map of the world…', 15);
  await initGeo();
  progress('Loading climate data…', 40);
  const { manifest, isDemo: demo } = await loadData();
  progress('Building the globe…', 70);
  initSearch();
  initGlobe($('globe'), {
    onSelect: (lat, lon) => select(lat, lon),
    onHoverCountry: (n) => ($('hover-country').textContent = n || ''),
    onProbe: probe,
  });
  initPanel({
    onVariable: (id) => setVariable(id),
    onPin: pinCurrent,
    onUnpin: (i) => { S.pins.splice(i, 1); setPins(S.pins); refreshPanel(); },
    onClose: closePlace,
    onScope: (sc) => { S.scope = sc; setHighlight(sc === 'country' ? S.place.country : null); refreshPanel(); revealPanel(); writeHash(); },
    onShare: () => { writeHash(); copy(location.href, 'Link copied'); },
  });

  setupSheet();
  initGlossary();
  setupPresets();
  try { renderValidation(); } catch (e) { console.warn('validation', e); }
  $('intro-case').onclick = () => caseStudy();
  $('dc-case').onclick = () => { document.getElementById('datacheck').classList.remove('open'); caseStudy(); };
  // --- top bar ---
  $('dock').replaceChildren(...manifest.variables.map((v, i) => {
    const b = el('button', { class: 'dock-btn', 'data-var': v.id, 'aria-label': v.label, onclick: () => setVariable(v.id) });
    b.innerHTML = `${icon(v.id)}<span class="dock-name">${DOCK_NAME[v.id] || v.label.split(' ')[0]}</span><span class="dock-tip"><b>${v.label}</b><kbd>${i + 1}</kbd></span>`;
    return b;
  }));
  setupHud();

  document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('year').oninput = (e) => { S.year = +e.target.value; if (S.mode !== 'year') setMode('year'); else redraw(); };
  $('play').onclick = togglePlay;
  $('btn-tour').onclick = tour;
  $('btn-hot').onclick = () => toggleHotspots();
  $('hs-close').onclick = () => toggleHotspots(false);
  document.querySelectorAll('[data-hs]').forEach((b) => (b.onclick = () => { S.hsMode = b.dataset.hs; renderHotspots(); }));
  setupChat();
  $('opacity').oninput = (e) => setOverlayOpacity(+e.target.value / 100);
  $('btn-about').onclick = () => openModal('about');
  $('btn-data').onclick = () => openModal('datacheck');
  document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => b.closest('.modal').classList.remove('open')));
  $('intro-go').onclick = closeIntro;
  $('intro-guide').onclick = () => { closeIntro(); toggleChat(true); };
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('mousedown', (e) => { if (e.target === m) m.classList.remove('open'); }));
  setupSearch();
  setupKeys();

  // --- data status ---
  if (demo) { // only exists when the site has fallen back to synthetic data
    const badge = el('button', { id: 'demo-badge', class: 'badge', title: 'Synthetic data — click for details', onclick: () => openModal('datacheck') });
    badge.innerHTML = '<i></i>DEMO DATA';
    document.querySelector('.hud-right').prepend(badge);
  }
  $('data-title').textContent = manifest.title || '';
  const kinds = [['✅', 'check'], ['❌', 'error'], ['⚠️', 'warning'], ['⚠', 'warning'], ['ℹ️', 'info'], ['ℹ', 'info']];
  $('problems').replaceChildren(...getProblems().map((p) => {
    const k = kinds.find(([e]) => p.startsWith(e)) || [null, 'info'];
    const li = el('li', { class: `st st-${k[1]}` });
    li.innerHTML = icon(k[1]);
    li.append(el('span', {}, k[0] ? p.slice(k[0].length).trim() : p));
    return li;
  }));
  try { renderJourney($('journey')); } catch (e) { console.warn('journey', e); }
  $('about-team').textContent = `Team ${CONFIG.team.name} (${CONFIG.team.location}): ${CONFIG.team.members.join(', ')} · Challenge: ${CONFIG.team.challenge}`;
  $('about-sources').replaceChildren(
    ...manifest.variables.map((v) =>
      el('li', {}, `${v.label}: `, el('a', { href: v.source.url || '#', target: '_blank', rel: 'noopener' }, `${v.source.name}${v.source.dataset ? ' · ' + v.source.dataset : ''}`))),
    ...(manifest.checks || []).map((c) => {
      const of = manifest.variables.find((v) => v.id === c.of);
      return el('li', {}, `Independent check for ${of ? of.label.toLowerCase() : c.of}: `, el('a', { href: c.source.url || '#', target: '_blank', rel: 'noopener' }, `${c.source.name}${c.source.dataset ? ' · ' + c.source.dataset : ''}`));
    }));

  // --- initial state (from URL if shared) ---
  const h = readHash();
  setVariable(h.v && manifest.variables.some((v) => v.id === h.v) ? h.v : manifest.variables[0].id, { silent: true });
  progress('Ready', 100);
  setTimeout(() => { $('loader').classList.add('done'); playIntro(); }, 350);
  if (h.lat !== undefined) { closeIntro(); select(h.lat, h.lon, { scope: h.scope }); }
}

function progress(text, pct) {
  $('loader-text').textContent = text;
  $('loader-pct').textContent = pct + '%';
  $('loader-bar').style.width = pct + '%';
}

// One-click example investigations, so nobody has to guess coordinates.
const PRESETS = [
  { label: 'Arctic warming', ic: 'arctic', lat: 73, lon: 57, name: 'Novaya Zemlya, Russian Arctic', variable: 'temperature' },
  { label: 'Megadrought', ic: 'desert', lat: -37, lon: -72.5, name: 'Central Chile', sub: 'Chile', variable: 'precipitation' },
  { label: 'UAE heat', ic: 'home', lat: 25.8, lon: 55.9, name: 'Ras Al Khaimah', sub: 'United Arab Emirates', variable: 'temperature' },
  { label: 'Sudden jump', ic: 'warning', lat: -7.5, lon: 32.5, name: 'Western Tanzania', sub: 'Tanzania', variable: 'soil_moisture' },
  { label: 'Datasets diverge', ic: 'opposite', lat: 7.5, lon: 22.5, name: 'Central African Republic', variable: 'temperature' },
];

function setupPresets() {
  const box = $('presets');
  if (!box) return;
  const has = (id) => getManifest().variables.some((v) => v.id === id);
  const cs = el('button', { class: 'preset preset-case', title: 'A complete worked investigation, from question to citation', onclick: () => caseStudy() });
  cs.innerHTML = `${icon('check')}<span>Worked example</span>`;
  box.append(cs);
  for (const p of PRESETS) {
    if (!has(p.variable)) continue;
    const b = el('button', { class: 'preset', title: `${p.name}: ${p.label.toLowerCase()}`, onclick: () => {
      select(p.lat, p.lon, { name: p.name, sub: p.sub, variable: p.variable, scope: 'point' });
    } });
    b.innerHTML = `${icon(p.ic)}<span>${p.label}</span>`;
    box.append(b);
  }
}

function caseStudy() {
  if (S.variable !== 'precipitation') setVariable('precipitation', { silent: true }); // map in the report shows rainfall
  openCaseStudy((pl) => { closeIntro(); select(pl.lat, pl.lon, { name: pl.name, sub: pl.country, variable: 'precipitation', scope: 'point' }); });
}

const DOCK_NAME = { temperature: 'Temp', precipitation: 'Rain', soil_moisture: 'Soil', ndvi: 'Green' };

function closeIntro() {
  if ($('intro').classList.contains('hidden')) return;
  $('intro').classList.add('hidden');
  document.body.classList.add('explore');
  showTapHint();
}

/** First-time hint: how to start. Disappears after a few seconds or on the first pick. */
let hintTimer = 0;
function showStartCard() {
  const c = $('start-card');
  if (!c || S.place) return false;
  let seen = false; try { seen = localStorage.getItem('tt-started') === '1'; } catch { /* storage blocked */ }
  if (seen) return false;
  c.hidden = false;
  requestAnimationFrame(() => c.classList.add('show'));
  const done = () => { c.classList.remove('show'); setTimeout(() => { c.hidden = true; }, 350); try { localStorage.setItem('tt-started', '1'); } catch { /* blocked */ } };
  $('sc-skip').onclick = done;
  $('sc-example').onclick = () => { done(); caseStudy(); };
  $('sc-try').onclick = () => { done(); select(-37, -72.5, { name: 'Central Chile', sub: 'Chile', variable: 'precipitation', scope: 'point' }); };
  hideStartCard = done;
  return true;
}
let hideStartCard = () => {};

function showTapHint() {
  const h = $('tap-hint');
  if (!h || S.place) return;
  if (showStartCard()) return;
  h.querySelector('span').textContent = matchMedia('(hover: none)').matches
    ? 'Tap anywhere on Earth to see how it is changing'
    : 'Click anywhere on Earth to see how it is changing';
  h.hidden = false;
  requestAnimationFrame(() => h.classList.add('show'));
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideTapHint, 7000);
}
function hideTapHint() {
  const h = $('tap-hint');
  if (!h) return;
  h.classList.remove('show');
  setTimeout(() => { h.hidden = true; }, 400);
}

/** Phone report sheet: tap the grip or swipe the header to shrink it and see the globe. */
function setupSheet() {
  const body = document.body;
  const toggle = (min) => { body.classList.toggle('sheet-min', min); if (min) $('panel').scrollTop = 0; };
  $('panel-grip').addEventListener('click', () => toggle(!body.classList.contains('sheet-min')));
  const head = document.querySelector('.panel-head');
  head.addEventListener('click', (e) => { if (body.classList.contains('sheet-min') && !e.target.closest('button')) toggle(false); });
  let y0 = null;
  const start = (e) => { y0 = e.touches[0].clientY; };
  const end = (e) => {
    if (y0 === null) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = null;
    if (dy > 45) toggle(true); else if (dy < -45) toggle(false);
  };
  for (const el of [head, $('panel-grip')]) {
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchend', end, { passive: true });
  }
}

const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (window.gsap) window.gsap.ticker.lagSmoothing(0); // keep animations on time even on slow laptops

/** Entrance choreography (GSAP). Skipped for people who prefer reduced motion. */
function playIntro() {
  if (calm || !window.gsap) return;
  const g = window.gsap;
  g.from('.intro-title .line > span', { yPercent: 110, duration: 1.1, ease: 'power4.out', stagger: 0.12 });
  g.from('.intro-eyebrow, .lead, .intro-steps > div, .intro-actions', { y: 24, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, delay: 0.35 });
  g.from('#topbar > *', { y: -30, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, delay: 0.2, clearProps: 'all' });
  // dock, console and legend fade in with CSS when you enter the globe (body.explore)
}

/** Stagger the report sections in whenever a new place opens. */
function revealPanel() {
  if (calm || !window.gsap) return;
  window.gsap.fromTo('#panel .reveal', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.04, overwrite: true, clearProps: 'transform' });
}

function buildTicks() {
  const grid = getGrid(S.variable);
  $('tl-ticks').replaceChildren(...grid.years.map((y) => el('i', { class: y % 5 === 0 ? 'major' : '', 'data-y': y % 5 === 0 ? y : '' })));
}

function setupHud() {
  const tick = () => { $('hud-clock').textContent = new Date().toISOString().slice(11, 19); };
  tick(); setInterval(tick, 1000);
  initCursor(); // custom cursor (js/cursor.js)
}

// -------------------------------------------------------------
function setVariable(id, { silent } = {}) {
  S.variable = id;
  document.querySelectorAll('.dock-btn').forEach((b) => b.classList.toggle('on', b.dataset.var === id));
  buildTicks();
  const grid = getGrid(id);
  const yr = $('year');
  yr.min = grid.years[0]; yr.max = grid.years.at(-1);
  if (S.year === null || S.year < grid.years[0] || S.year > grid.years.at(-1)) S.year = grid.years.at(-1);
  yr.value = S.year;
  redraw();
  if (S.place) refreshPanel();
  if (!silent) writeHash();
}

function setMode(mode) {
  S.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  document.querySelector('.seg').classList.toggle('second', mode === 'year');
  document.body.classList.toggle('mode-year', mode === 'year');
  if (mode === 'trend' && S.playing) togglePlay();
  redraw();
}

function redraw() {
  setLayer(S.variable, S.mode, S.year);
  if (document.body.classList.contains('hs-open')) renderHotspots();
  $('year-label').textContent = S.year;
  updateYearMarker(S.mode === 'year' ? S.year : null);
  renderLegend();
}

function renderLegend() {
  const L = getLegend();
  if (!L) return;
  $('legend-title').textContent = L.title;
  $('legend-bar').style.background = `linear-gradient(90deg, ${L.colors.join(',')})`;
  const d = L.unit === '%' ? 0 : L.unit === '°C' ? 1 : 2;
  $('legend-lo').textContent = `${L.lo > 0 ? '+' : ''}${fmt(L.lo, d)} ${L.unit}`;
  $('legend-hi').textContent = `+${fmt(L.hi, d)} ${L.unit}`;
}

function togglePlay() {
  if (S.playing) {
    clearInterval(S.playing); S.playing = null; $('play').innerHTML = PLAY; $('play').classList.remove('playing');
    return;
  }
  if (S.mode !== 'year') setMode('year');
  const grid = getGrid(S.variable);
  if (S.year >= grid.years.at(-1)) S.year = grid.years[0];
  $('play').innerHTML = PAUSE; $('play').classList.add('playing');
  S.playing = setInterval(() => {
    S.year++;
    if (S.year > grid.years.at(-1)) { togglePlay(); S.year = grid.years.at(-1); }
    $('year').value = S.year;
    redraw();
  }, CONFIG.playSpeed);
}

// -------------------------------------------------------------
function select(lat, lon, opts = {}) {
  if (isTouring() && !opts.fromTour && !opts.fromChat) stopTour();
  if (!opts.fromChat) resetFocus();
  autoRotate(false);
  hideTapHint();
  if (!opts.fromTour) hideStartCard();
  document.body.classList.remove('sheet-min');
  closeIntro();
  if (opts.variable && opts.variable !== S.variable) setVariable(opts.variable, { silent: true });
  const country = opts.country || countryAt(lat, lon);
  if (opts.scope) S.scope = opts.scope;
  if (!country || (opts.fromTour && !opts.scope)) S.scope = 'point';
  let name, sub;
  if (opts.name) { name = opts.name; sub = opts.sub || country || ''; }
  else {
    const city = nearestNamed(lat, lon);
    if (city) { name = city.name; sub = city.sub; }
    else if (country) { name = country; sub = ''; }
    else { name = oceanName(lat, lon); sub = ''; }
  }
  if (sub === 'Country' || sub === 'Coordinates') sub = '';
  S.place = { lat: +lat.toFixed(3), lon: +lon.toFixed(3), name, sub, short: name.split(',')[0], country };
  setSelection(lat, lon);
  setHighlight(S.scope === 'country' ? country : null);
  if (!opts.fromTour) flyTo(lat, lon, 1.5, 1200);
  refreshPanel();
  revealPanel();
  writeHash();
}

function refreshPanel() {
  if (!S.place) return;
  renderPanel({ place: S.place, variable: S.variable, scope: S.scope, pins: S.pins, year: S.mode === 'year' ? S.year : null });
}

function pinCurrent() {
  if (!S.place || S.pins.length >= 4) return;
  const asCountry = S.scope === 'country' && S.place.country;
  S.pins.push({ ...S.place, scope: S.scope, short: asCountry ? S.place.country : S.place.short });
  setPins(S.pins);
  toast(`${asCountry ? S.place.country : S.place.short} added — click another place to compare`);
  refreshPanel();
}

function closePlace() { closePanel(); clearSelection(); setHighlight(null); S.place = null; writeHash(); }

function tour() {
  if (isTouring()) { stopTour(); return; }
  closeIntro();
  $('btn-tour').querySelector('span').textContent = 'Stop';
  startTour({
    select: (p, o = {}) => { flyTo(p.lat, p.lon, 1.6, 1800); select(p.lat, p.lon, { name: p.name, ...o, fromTour: true }); },
    flyTo, setVariable, setMode, autoRotate,
    closePlace,
    reset: () => { closePlace(); S.pins = []; setPins([]); },
    setYear: (y) => { S.year = y; $('year').value = y; redraw(); },
    play: () => { if (!S.playing) togglePlay(); },
    pause: () => { if (S.playing) togglePlay(); },
    hotspots: (on) => toggleHotspots(on),
    chat: (on) => toggleChat(on),
    clearChat: () => { $('chat-log').replaceChildren(); $('chat-sugg').replaceChildren(); },
    ask,
    pin: pinCurrent,
    clearPins: () => { if (S.pins.length) { S.pins = []; setPins([]); refreshPanel(); } },
    palette: (q) => { openPalette(); typeInto($('search'), q); },
    closePalette: () => $('palette').classList.remove('open'),
    openModal,
    closeModals: () => document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open')),
    hasVar: (id) => getManifest().variables.some((v) => v.id === id),
    hasCheck: (id) => !!getCheck(id),
    scrollPanel: (sel) => {
      const p = $('panel'), t = p.querySelector(sel);
      if (!t) return;
      // land the target just below the sticky header, so its title is never hidden
      const pr = p.getBoundingClientRect(), head = p.querySelector('.panel-head').getBoundingClientRect();
      const top = p.scrollTop + (t.getBoundingClientRect().top - pr.top) - (head.height + 12);
      p.scrollTo({ top: Math.max(0, top), behavior: calm ? 'auto' : 'smooth' });
    },
    openDetails: (sel) => {
      const t = $('panel').querySelector(sel);
      const d = t && (t.tagName === 'DETAILS' ? t : t.closest('details'));
      if (d) d.open = true;
    },
  }, { onEnd: () => { $('btn-tour').querySelector('span').textContent = 'Story'; } });
}

// -------------------------------------------------------------
//  Chat: "Ask TerraTrace" (logic lives in assistant.js)
// -------------------------------------------------------------
function toggleChat(force) {
  const open = document.body.classList.toggle('chat-open', typeof force === 'boolean' ? force : undefined);
  if (open) {
    document.body.classList.remove('hs-open');
    closeIntro();
    if (!$('chat-log').children.length) ask('');
    setTimeout(() => $('chat-input').focus(), 50);
  }
}
function ask(text, shown = text) {
  const log = $('chat-log');
  if (text) log.append(el('div', { class: 'msg me' }, shown)); // textContent: user text is never treated as HTML
  const res = answer(text, {
    place: S.place, variable: S.variable, scope: S.scope,
    api: {
      select: (lat, lon, o) => select(lat, lon, { ...o, fromChat: true }),
      setVariable, setMode, flyTo,
      openHotspots: () => toggleHotspots(true),
    },
  });
  const bot = el('div', { class: 'msg bot' });
  bot.innerHTML = res.html; // built from our own templates + escaped data
  if (res.actions.length) {
    bot.append(el('div', { class: 'msg-actions' }, res.actions.map((a) => el('button', { class: 'btn small', onclick: () => { a.run(); if (/copy/i.test(a.label)) toast('Copied'); } }, a.label))));
  }
  if (res.quick && res.quick.length) {
    bot.append(el('div', { class: 'msg-quick' }, res.quick.map((q) => {
      const b = el('button', { onclick: () => ask(q.ask, q.label) });
      if (q.ic) b.innerHTML = q.ic;
      b.append(el('span', {}, q.label));
      return b;
    })));
  }
  log.append(bot);
  if (res.auto) res.auto();
  $('chat-sugg').replaceChildren(...res.suggestions.slice(0, 3).map((q) => el('button', { onclick: () => ask(q) }, q)));
  log.scrollTop = log.scrollHeight;
  if (!calm && window.gsap) window.gsap.from(bot, { y: 12, opacity: 0, duration: 0.35, ease: 'power3.out' });
}
function setupChat() {
  $('btn-chat').onclick = () => toggleChat();
  $('chat-close').onclick = () => toggleChat(false);
  $('chat-form').onsubmit = (e) => {
    e.preventDefault();
    const q = $('chat-input').value.trim();
    if (!q) return;
    $('chat-input').value = '';
    ask(q.slice(0, 300));
  };
}

// -------------------------------------------------------------
//  Hover probe: value under the mouse
// -------------------------------------------------------------
function probe(lat, lon, x, y) {
  const box = $('probe');
  $('hud-coords').textContent = lat === null ? '—' : formatCoord(lat, lon);
  if (lat === null || isTouring()) { box.classList.remove('show'); return; }
  const s = getSeries(S.variable, lat, lon);
  const where = countryAt(lat, lon) || oceanName(lat, lon);
  let line;
  if (!s) line = '<span class="muted">no data</span>';
  else if (S.mode === 'trend') {
    const t = s.trend;
    const abs = trendDisplay(S.variable) === 'absolute';
    const v = abs ? `${signed(t.per_decade, Math.max(1, s.decimals))} ${s.unit}` : `${signed(t.rel_per_decade, 1)}%`;
    line = `<b>${v}</b> / decade ${t.significant ? '' : '<span class="muted">(not significant)</span>'}`;
  } else {
    const i = s.years.indexOf(S.year);
    const v = s.values[i];
    line = v === null ? '<span class="muted">no data this year</span>' : `<b>${fmt(v, s.decimals)} ${s.unit}</b> in ${S.year}`;
  }
  box.innerHTML = `<div class="pr-where">${where} · ${formatCoord(lat, lon)}</div><div>${line}</div>`;
  box.style.transform = `translate(${x + 16}px, ${y + 16}px)`;
  box.classList.add('show');
}

// -------------------------------------------------------------
//  Hotspots drawer
// -------------------------------------------------------------
function toggleHotspots(force) {
  const open = document.body.classList.toggle('hs-open', typeof force === 'boolean' ? force : undefined);
  if (open) { document.body.classList.remove('chat-open'); renderHotspots(); }
}
// ---- Anomaly radar: the most unusual places on Earth in a chosen year ----
const radarCache = {};
function radarData(id) {
  if (radarCache[id]) return radarCache[id];
  const grid = getGrid(id);
  const counts = grid.years.map(() => 0), valid = grid.years.map(() => 0);
  const rows = grid.years.map(() => []);
  for (const c of grid.cells) {
    const t = trendForCell(id, c);
    const z = zScores(grid.years, c.values, t.per_decade);
    if (!z) continue;
    z.forEach((v, i) => {
      if (v === null) return;
      valid[i]++;
      if (Math.abs(v) >= ANOMALY_Z) { counts[i]++; rows[i].push({ lat: c.lat, lon: c.lon, z: v }); }
    });
  }
  rows.forEach((r) => r.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)));
  return (radarCache[id] = { years: grid.years, counts, valid, rows });
}

function renderRadar() {
  const box = $('hs-radar');
  const R = radarData(S.variable);
  const yi = Math.max(0, R.years.indexOf(S.radarYear ?? R.years.at(-1)));
  const year = R.years[yi];
  const max = Math.max(...R.counts) || 1;
  const W = 290, H = 70, bw = W / R.years.length;
  const bars = R.counts.map((n, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - (n / max) * (H - 4)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${((n / max) * (H - 4)).toFixed(1)}" class="${i === yi ? 'on' : ''}" data-i="${i}"><title>${R.years[i]}: ${n} unusual places</title></rect>`).join('');
  const pct = R.valid[yi] ? Math.round((R.counts[yi] / R.valid[yi]) * 100) : 0;
  const avg = R.counts.reduce((a, b) => a + b, 0) / R.counts.length;
  const ratio = avg ? R.counts[yi] / avg : 0;
  const yAvg = H - (avg / max) * (H - 4);
  box.innerHTML = `<div class="rd-year"><button class="icon small" id="rd-prev" aria-label="Previous year">‹</button><b>${year}</b><button class="icon small" id="rd-next" aria-label="Next year">›</button></div>
    <svg class="rd-chart" viewBox="0 0 ${W} ${H + 14}" role="img" aria-label="Number of unusual places per year">${bars}
      <line x1="0" x2="${W}" y1="${yAvg.toFixed(1)}" y2="${yAvg.toFixed(1)}" class="rd-avg"/><text x="${W}" y="${(yAvg - 3).toFixed(1)}" text-anchor="end" class="rd-ax">average year</text>
      <text x="0" y="${H + 12}" class="rd-ax">${R.years[0]}</text><text x="${W}" y="${H + 12}" text-anchor="end" class="rd-ax">${R.years.at(-1)}</text></svg>
    <p class="rd-stat"><b>${R.counts[yi]}</b> places (${pct}% of the map) were unusual in ${year}: more than ${ANOMALY_Z} SD from what their own long-term trend predicts. That is <b>${fmt(ratio, 1)}×</b> the average year (${Math.round(avg)} places).</p>
    <details class="rd-why"><summary>How to read this</summary><p>Some places are flagged every year by chance: weather varies, and extreme years happen naturally, so about ${Math.round(avg)} places a year is normal. A year well above the average line means unusual conditions were unusually widespread. ${year >= 2023 && ratio > 1.5 ? 'The 2023–24 peak coincides with a strong El Niño and record-warm oceans, which raise temperatures across large regions at once.' : ''} Neighbouring 5° cells are not independent, so one large event can flag many cells. A single unusual year is not a trend, and the count depends on the 2 SD threshold.</p></details>`;
  box.querySelectorAll('rect').forEach((r) => (r.onclick = () => { S.radarYear = R.years[+r.dataset.i]; renderHotspots(); }));
  $('rd-prev').onclick = () => { S.radarYear = R.years[Math.max(0, yi - 1)]; renderHotspots(); };
  $('rd-next').onclick = () => { S.radarYear = R.years[Math.min(R.years.length - 1, yi + 1)]; renderHotspots(); };
  return { year, rows: R.rows[yi] };
}

function renderHotspots() {
  const v = getVariable(S.variable);
  if (S.hsMode === 'anomaly') {
    document.querySelectorAll('[data-hs]').forEach((b) => b.classList.toggle('on', b.dataset.hs === 'anomaly'));
    $('hs-radar').hidden = false;
    $('hs-intro').textContent = 'Anomaly radar: places where a single year was far outside its normal range, even after allowing for the long-term trend. Click one to fly there.';
    const { year, rows } = renderRadar();
    $('hs-title').textContent = `${v.label}, ${year}`;
    $('hs-up-t').textContent = `▲ ${anomalyWord(S.variable, 1).replace(/^./, (c) => c.toUpperCase())}`;
    $('hs-down-t').textContent = `▼ ${anomalyWord(S.variable, -1).replace(/^./, (c) => c.toUpperCase())}`;
    const nameOfA = (r) => nearestNamed(r.lat, r.lon, 400)?.name || countryAt(r.lat, r.lon) || oceanName(r.lat, r.lon);
    const pick = (list) => { const seen = new Set(); return list.filter((r) => { r.name = nameOfA(r); if (seen.has(r.name)) return false; seen.add(r.name); return true; }).slice(0, 5); };
    const item = (r) => el('li', {}, el('button', { onclick: () => { S.year = year; $('year').value = year; if (S.mode !== 'year') setMode('year'); else redraw(); select(r.lat, r.lon, { scope: 'point' }); } }, el('span', {}, r.name), el('b', {}, `${r.z > 0 ? '+' : '−'}${fmt(Math.abs(r.z), 1)} SD`)));
    const up = pick(rows.filter((r) => r.z > 0)), down = pick(rows.filter((r) => r.z < 0));
    $('hs-up').replaceChildren(...(up.length ? up.map(item) : [el('li', { class: 'muted' }, 'None')]));
    $('hs-down').replaceChildren(...(down.length ? down.map(item) : [el('li', { class: 'muted' }, 'None')]));
    $('hs-note').hidden = false;
    $('hs-note').textContent = 'An unusual year is a single event, not a trend. Clicking a place switches the globe to Timeline view for that year.';
    return;
  }
  $('hs-radar').hidden = true;
  $('hs-intro').textContent = 'Biggest statistically significant changes on Earth. Click one to fly there.';
  const st = styleFor(S.variable);
  const abs = trendDisplay(S.variable) === 'absolute';
  const byCountry = S.hsMode === 'country';
  document.querySelectorAll('[data-hs]').forEach((b) => b.classList.toggle('on', b.dataset.hs === S.hsMode));
  const raw = byCountry ? countryRanking(S.variable, 6) : hotspots(S.variable, 40);
  $('hs-title').textContent = v.label;
  $('hs-up-t').textContent = '▲ Biggest increase';
  $('hs-down-t').textContent = '▼ Biggest decrease';
  const nameOf = (r) => nearestNamed(r.lat, r.lon, 400)?.name || countryAt(r.lat, r.lon) || oceanName(r.lat, r.lon);
  const dedupe = (rows) => { const seen = new Set(); return rows.filter((r) => { r.name = nameOf(r); if (seen.has(r.name)) return false; seen.add(r.name); return true; }).slice(0, 5); };
  const up = byCountry ? raw.up : dedupe(raw.up.filter((r) => r.v > 0)), down = byCountry ? raw.down : dedupe(raw.down.filter((r) => r.v < 0));
  const item = (r) => {
    const name = r.name;
    const val = abs ? `${signed(r.t.per_decade, Math.max(1, v.decimals ?? 2))} ${v.unit}` : `${signed(r.v, 0)}%`;
    return el('li', {}, el('button', { onclick: () => (byCountry ? select(r.lat, r.lon, { country: r.country, scope: 'country' }) : select(r.lat, r.lon, { scope: 'point' })) }, el('span', {}, name), el('b', {}, val)));
  };
  $('hs-up').replaceChildren(...(up.length ? up.map(item) : [el('li', { class: 'muted' }, 'None significant')]));
  $('hs-down').replaceChildren(...(down.length ? down.map(item) : [el('li', { class: 'muted' }, 'None significant')]));
  const chk = getCheck(S.variable);
  $('hs-note').hidden = !(chk && raw.hidden);
  if (chk && raw.hidden) $('hs-note').textContent = `${raw.hidden} ${byCountry ? (raw.hidden === 1 ? 'country' : 'countries') : (raw.hidden === 1 ? 'region' : 'regions')} left out: ${chk.short || (chk.of === 'precipitation' ? 'NASA GPCP' : 'NASA GISTEMP')}, a second NASA dataset, shows the trend going the opposite way there.`;
}

// -------------------------------------------------------------
function setupSearch() {
  const input = $('search'), list = $('search-results'), pal = $('palette');
  let items = [], active = 0;
  const commands = () => [
    ...getManifest().variables.map((v) => ({ name: `Show ${v.label}`, sub: 'Layer', ic: icon(v.id), run: () => setVariable(v.id) })),
    { name: 'Hotspots: fastest-changing places', sub: 'Command', ic: icon('fire'), run: () => toggleHotspots(true) },
    { name: 'Anomaly radar: most unusual places by year', sub: 'Command', ic: icon('warning'), run: () => { S.hsMode = 'anomaly'; toggleHotspots(true); } },
    { name: 'Ask TerraTrace a question', sub: 'Command', ic: icon('_default'), run: () => toggleChat(true) },
    { name: 'Story mode: guided tour', sub: 'Command', ic: PLAY, run: tour },
    { name: 'Play the timeline', sub: 'Command', ic: PLAY, run: togglePlay },
    { name: 'Trend view', sub: 'Command', ic: icon('_default'), run: () => setMode('trend') },
    { name: 'Timeline view', sub: 'Command', ic: icon('_default'), run: () => setMode('year') },
    { name: 'Data check', sub: 'Command', ic: icon('_default'), run: () => openModal('datacheck') },
    { name: 'About TerraTrace', sub: 'Command', ic: icon('_default'), run: () => openModal('about') },
  ];
  const RK = 'tt-recent';
  const recent = () => { try { return JSON.parse(localStorage.getItem(RK) || '[]'); } catch { return []; } };
  const remember = (p) => {
    if (p.run) return;
    const r = recent().filter((q) => !(q.name === p.name && q.kind === p.kind));
    r.unshift({ name: p.name, sub: p.sub, kind: p.kind, lat: p.lat, lon: p.lon });
    try { localStorage.setItem(RK, JSON.stringify(r.slice(0, 4))); } catch { /* storage blocked */ }
  };
  const clock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>';
  const suggestions = () => {
    const r = recent().map((q) => ({ ...q, ic: clock, sub: `Recent${q.sub ? ' · ' + q.sub : ''}`, _recent: true }));
    const ex = ['Ras Al Khaimah', 'Stirling', 'Svalbard', 'Manaus'].map((n) => search(n, 1)[0]).filter(Boolean).filter((e) => !r.some((q) => q.name === e.name));
    return [...r, ...ex].slice(0, 6);
  };
  const pin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s7-6.200 7-11.500a7 7 0 1 0-14 0C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/></svg>';
  const query = (q) => {
    q = q.trim();
    if (!q) return [...suggestions(), ...commands().slice(-7, -4)];
    const n = q.toLowerCase();
    return [...search(q, 6), ...commands().filter((c) => c.name.toLowerCase().includes(n))].slice(0, 9);
  };
  const render = () => {
    list.replaceChildren(...items.map((p, i) => {
      const li = el('li', { class: i === active ? 'active' : '', onmousedown: (e) => { e.preventDefault(); go(p); }, onmousemove: () => { if (active !== i) { active = i; render(); } } });
      li.innerHTML = `<i>${p.ic || pin}</i><b></b><span></span>`;
      li.querySelector('b').textContent = p.name;
      li.querySelector('span').textContent = p.sub || '';
      return li;
    }));
    if (!items.length) list.replaceChildren(el('li', { class: 'none' }, `No place called “${input.value.trim()}” found. Try a city, a country, or coordinates like 25.8, 55.9`));
  };
  const close = () => { pal.classList.remove('open'); input.blur(); };
  const open = () => { pal.classList.add('open'); input.value = ''; items = query(''); active = 0; render(); input.focus(); };
  const go = (p) => {
    close();
    remember(p);
    if (p.run) p.run();
    else if (p.kind === 'coords') select(p.lat, p.lon); // name it from the nearest city / country
    else if (p.kind === 'country') select(p.lat, p.lon, { country: p.name, scope: 'country' });
    else select(p.lat, p.lon, { name: p.name, sub: p.sub, scope: 'point' });
  };
  openPalette = open;
  $('search-trigger').onclick = open;
  pal.addEventListener('mousedown', (e) => { if (e.target === pal) close(); });
  input.oninput = () => { items = query(input.value); active = 0; render(); };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[active]) go(items[active]);
    else if (e.key === 'Escape') close();
  };
}
let openPalette = () => {};

function setupKeys() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === '/') { e.preventDefault(); openPalette(); }
    else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key.toLowerCase() === 't') tour();
    else if (e.key.toLowerCase() === 'h') toggleHotspots();
    else if (e.key.toLowerCase() === 'a') { e.preventDefault(); toggleChat(); }
    else if (e.key.toLowerCase() === 'm') setMode(S.mode === 'trend' ? 'year' : 'trend');
    else if (e.key === 'Escape') { document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open')); closeIntro(); }
    else if (e.key >= '1' && e.key <= '9') {
      const v = getManifest().variables[+e.key - 1];
      if (v) setVariable(v.id);
    }
  });
}

function openModal(id) {
  if (id === 'datacheck') setTimeout(renderGlobalFigures, 30);
  $(id).classList.add('open');
  if (!calm && window.gsap) window.gsap.fromTo(`#${id} .modal-card`, { y: 30, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out' });
}

// -------------------------------------------------------------
//  Shareable links:  #v=temperature&lat=25.8&lon=55.9
// -------------------------------------------------------------
function writeHash() {
  const p = new URLSearchParams();
  p.set('v', S.variable);
  if (S.place) { p.set('lat', S.place.lat); p.set('lon', S.place.lon); if (S.scope === 'country') p.set('s', 'c'); }
  history.replaceState(null, '', '#' + p.toString());
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const out = { v: p.get('v') };
  const lat = parseFloat(p.get('lat')), lon = parseFloat(p.get('lon'));
  if (Number.isFinite(lat) && Number.isFinite(lon)) { out.lat = lat; out.lon = lon; out.scope = p.get('s') === 'c' ? 'country' : 'point'; }
  return out;
}

// expose for debugging in the console:  TT.select(25.8, 55.9)
window.TT = { select, setVariable, setMode, ask, toggleChat, S, isDemo, formatCoord, ramp, flyTo };