// =============================================================
//  tour.js — "Story mode": a presenter-controlled walkthrough
//
//  T          start / stop the demo
//  ↓  →  PgDn  next chapter      (presentation clickers send PgDn)
//  ↑  ←  PgUp  previous chapter
//  Esc        end the demo
//
//  Every chapter shows one feature. Chapters that need a variable
//  that isn't loaded (e.g. vegetation before the NDVI file arrives)
//  are skipped automatically. Captions with numbers are generated
//  from the DATA, so they are always truthful.
// =============================================================
import { getSeries } from './data.js';
import { summary } from './story.js';

let running = false;
let idx = 0;
let steps = [];
let ctx = null;
let onEndCb = null;
let typing = null;

export function isTouring() { return running; }

// -------------------------------------------------------------
//  The chapters
// -------------------------------------------------------------
const ARCTIC = { name: 'Novaya Zemlya, Russian Arctic', lat: 73.0, lon: 57.0 };
const CHILE = { name: 'Central Chile', lat: -37.0, lon: -72.5 };
const TANZANIA = { lat: -7.5, lon: 32.5, name: 'Western Tanzania', sub: 'Tanzania' };
const GANGES = { name: 'Ganges plain, India', lat: 27.0, lon: 79.0 };
const RONDONIA = { name: 'Rondônia, Brazil', lat: -10.9, lon: -62.8 };
const UAE = { name: 'United Arab Emirates', lat: 24.0, lon: 54.5 };
const LONDON = { name: 'London, United Kingdom', lat: 51.5, lon: -0.13 };
const RAK = { name: 'Ras Al Khaimah, UAE', lat: 25.8, lon: 55.9 };

const CHAPTERS = [
  {
    title: 'The whole planet, tested',
    hook: 'Every colour on this globe is a 24-year NASA record (2001–2024) that has been statistically tested. Red is warming, blue is cooling, and faded areas mean the change could just be noise.',
    spot: '#legend',
    run: (c) => { c.reset(); c.setVariable('temperature'); c.setMode('trend'); c.flyTo(22, 25, 2.5, 2000); },
  },
  {
    title: 'Click any place on Earth',
    hook: 'One click opens a location report. The Barents–Kara Sea around Novaya Zemlya is one of the fastest-warming places on Earth as its sea ice disappears.',
    place: ARCTIC, variable: 'temperature',
    spot: '#panel .panel-head',
  },
  {
    title: 'Proof, not guesswork',
    hook: (c) => 'The Mann–Kendall test tells us whether the trend is real, and Sen’s slope measures how fast it is changing, with a 95% confidence interval.' + (c.hasCheck('temperature') ? ' A second NASA dataset, built from weather stations, double-checks every temperature trend.' : ''),
    spot: '#panel .headline, #panel #crosscheck',
    scroll: '.headline',
  },
  {
    title: 'See every year',
    hook: 'The chart shows each year’s value with the trend line. The climate stripes give the same story at a glance, one bar per year.',
    spot: '#panel .chart-wrap, #panel .stripes-block',
    scroll: '.chart-wrap',
  },
  {
    title: 'Explained in plain language',
    hook: 'Every report explains what the variable is, why it matters, and what the trend means, in words a student can understand.',
    spot: '#panel #summary, #panel .var-about',
    scroll: '.var-about',
    run: (c) => { c.openDetails('.var-about'); },
  },
  {
    title: 'Rainfall',
    hook: 'Switch variables with one click. Central Chile has been in a “megadrought” since 2010, one of the clearest rainfall declines on Earth.',
    place: CHILE, variable: 'precipitation',
    spot: '#dock',
  },
  {
    title: 'Soil moisture',
    hook: 'Root-zone soil moisture shows how much water crops can actually reach. The Ganges plain in northern India is one of the world’s most important farming regions.',
    place: GANGES, variable: 'soil_moisture', needs: 'soil_moisture',
    spot: '#panel #fingerprint',
  },
  {
    title: 'Fake-trend detector',
    hook: 'Not every trend is real. Here MERRA-2 soil moisture rises in a single step around 2018, while an independent NASA land model (GLDAS) shows drying. TerraTrace flags both problems, so the trend is reported as unresolved rather than as fact.',
    place: TANZANIA, variable: 'soil_moisture', needs: 'soil_moisture',
    spot: '#panel #crosscheck, #panel #jumpcheck',
    scroll: '#crosscheck',
  },
  {
    title: 'Vegetation from space',
    hook: 'NDVI from NASA’s MODIS satellite measures how green the land is. Rondônia is where the Amazon meets farmland.',
    place: RONDONIA, variable: 'vegetation', needs: 'vegetation',
    spot: '#panel .headline',
  },
  {
    title: 'Whole countries',
    hook: 'Switch from one spot to a whole-country average, weighted by area, for the entire United Arab Emirates.',
    place: UAE, variable: 'temperature', scope: 'country',
    spot: '#scope',
  },
  {
    title: 'Compare places',
    hook: 'Pin a place and compare it with another. Here, the UAE is compared with London.',
    variable: 'temperature',
    spot: '#panel .chart-wrap, #panel .compare-row',
    scroll: '.chart-wrap',
    run: (c) => {
      c.select(UAE, { variable: 'temperature', scope: 'country' });
      c.pin();
      c.select(LONDON, { variable: 'temperature' });
    },
    keepPins: true,
  },
  {
    title: 'Watch it happen',
    hook: 'The timeline replays the planet year by year, from 2001 to 2024.',
    spot: '#console',
    run: (c) => { c.closePlace(); c.flyTo(25, 30, 2.5, 1600); c.setMode('year'); c.setYear(2001); setTimeout(() => running && c.play(), 900); },
  },
  {
    title: 'Hotspots',
    hook: 'Which countries are changing fastest? Hotspots ranks them, and every ranking uses statistically significant trends only.',
    spot: '#hotspots',
    run: (c) => { c.setMode('trend'); c.hotspots(true); },
  },
  {
    title: 'Ask TerraTrace',
    hook: 'Students can ask questions in plain English. The assistant answers only from the loaded data, so it never invents numbers.',
    spot: '#chat',
    run: (c) => {
      c.select(RAK, { variable: 'temperature' });
      c.chat(true); c.clearChat();
      c.ask('How is this place changing?');
      setTimeout(() => running && c.ask('Is it significant?'), 900);
    },
  },
  {
    title: 'Guided data detective',
    hook: 'Not sure where to start? “Guide me as a data detective” suggests a type of place, the right variables, and an example to investigate.',
    spot: '#chat',
    run: (c) => { c.chat(true); c.clearChat(); c.ask('investigate city', 'A big city'); },
  },
  {
    title: 'Find anywhere',
    hook: 'Search any city, country or coordinates, or type a command. Press Ctrl K from anywhere.',
    spot: '#palette .palette-card', side: true,
    run: (c) => { c.palette('Dubai'); },
  },
  {
    title: 'Cite it. Export it.',
    hook: 'One click gives a printable fact sheet, the data as CSV, the chart, and a ready-made APA, Harvard or BibTeX citation of the NASA dataset.',
    place: RAK, variable: 'temperature',
    spot: '#panel .export-row, #panel .cite-row',
    scroll: '.export-row',
    run: (c) => { c.openDetails('#cite-style', true); },
  },
  {
    title: 'The data journey',
    hook: 'Every step from NASA’s servers to this globe, with real counts: requested, downloaded, cleaned, turned into annual values, tested and validated. Anyone can check our work.',
    spot: '#datacheck .modal-card', side: true,
    run: (c) => { c.closePlace(); c.openModal('datacheck'); },
  },
  {
    title: 'Find it. Prove it. Cite it.',
    hook: 'TerraTrace: every place on Earth has a climate story. Now any student can tell it with real NASA evidence.',
    run: (c) => { c.reset(); c.setVariable('temperature'); c.setMode('trend'); c.flyTo(RAK.lat, RAK.lon, 2.6, 2400); setTimeout(() => running && c.autoRotate(true), 2500); },
  },
];

// -------------------------------------------------------------
export function startTour(context, { onEnd } = {}) {
  if (running) return stopTour();
  ctx = context;
  onEndCb = onEnd;
  steps = CHAPTERS.filter((s) => !s.needs || ctx.hasVar(s.needs));
  running = true;
  idx = 0;
  document.body.classList.add('touring');
  document.getElementById('probe')?.classList.remove('show');
  window.addEventListener('keydown', onKey, true);
  show();
}

export function stopTour() {
  if (!running) return;
  running = false;
  clearInterval(typing);
  window.removeEventListener('keydown', onKey, true);
  document.body.classList.remove('touring', 'tour-side');
  spot(null);
  ctx.pause();
  ctx.closePalette();
  ctx.closeModals();
  const cap = document.getElementById('tour-caption');
  cap.classList.remove('show');
  onEndCb && onEndCb();
}

export function nextStep() { if (!running) return; if (idx >= steps.length - 1) return stopTour(); idx++; show(); }
export function prevStep() { if (!running || idx === 0) return; idx--; show(); }

function onKey(e) {
  const k = e.key;
  if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); e.stopImmediatePropagation(); nextStep(); }
  else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); e.stopImmediatePropagation(); prevStep(); }
  else if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); stopTour(); }
}

function show() {
  const s = steps[idx];
  const c = ctx;
  clearInterval(typing);
  // tidy up whatever the previous chapter opened
  c.pause();
  c.closePalette();
  c.closeModals();
  c.hotspots(false);
  c.chat(false);
  c.autoRotate(false);
  if (!s.keepPins) c.clearPins();
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (s.title !== 'Watch it happen') c.setMode('trend');
  document.body.classList.toggle('tour-side', !!s.side);

  if (s.place) c.select(s.place, { variable: s.variable, scope: s.scope });
  if (s.run) s.run(c);

  spot(s.spot);
  // the panel may re-render: scroll + spotlight again after it settles
  setTimeout(() => {
    if (!running || steps[idx] !== s) return;
    if (s.scroll) c.scrollPanel(s.scroll);
    spot(s.spot);
  }, s.place || s.run ? 700 : 100);

  caption(s);
}

function caption(s) {
  const cap = document.getElementById('tour-caption');
  const n = steps.length;
  let data = '';
  if (s.place && s.variable) {
    const series = getSeries(s.variable, s.place.lat, s.place.lon);
    if (series && s.scope !== 'country') data = summary(series, s.place.name.split(',')[0]);
  }
  cap.innerHTML = `
    <div class="tc-step">CHAPTER ${String(idx + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')} · ${s.title.toUpperCase()}</div>
    <div class="tc-hook">${typeof s.hook === 'function' ? s.hook(ctx) : s.hook}</div>
    ${data ? `<div class="tc-data">${data}</div>` : ''}
    <div class="tc-nav">
      <button class="tc-btn" data-tc="prev" ${idx === 0 ? 'disabled' : ''} aria-label="Previous chapter">↑ Back</button>
      <span class="tc-dots">${steps.map((_, i) => `<i class="${i === idx ? 'on' : i < idx ? 'done' : ''}"></i>`).join('')}</span>
      <button class="tc-btn" data-tc="next" aria-label="Next chapter">${idx === n - 1 ? 'Finish' : 'Next ↓'}</button>
      <button class="tc-btn tc-x" data-tc="stop" aria-label="End demo">Esc</button>
    </div>`;
  cap.querySelector('[data-tc="prev"]').onclick = prevStep;
  cap.querySelector('[data-tc="next"]').onclick = nextStep;
  cap.querySelector('[data-tc="stop"]').onclick = stopTour;
  cap.classList.remove('show');
  void cap.offsetWidth; // restart the entrance animation
  cap.classList.add('show');
}

let spotted = [];
function spot(sel) {
  spotted.forEach((e) => e.classList.remove('tour-spot'));
  spotted = sel ? [...document.querySelectorAll(sel)] : [];
  spotted.forEach((e) => e.classList.add('tour-spot'));
}

/** Used by the palette chapter: types the query letter by letter. */
export function typeInto(input, text) {
  clearInterval(typing);
  input.value = '';
  let i = 0;
  typing = setInterval(() => {
    if (!running) return clearInterval(typing);
    input.value = text.slice(0, ++i);
    input.dispatchEvent(new Event('input'));
    if (i >= text.length) clearInterval(typing);
  }, 140);
}
