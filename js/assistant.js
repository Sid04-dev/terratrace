// =============================================================
//  assistant.js — "Ask TerraTrace" investigation assistant
// -------------------------------------------------------------
//  IMPORTANT DESIGN CHOICE: this is NOT a generative AI.
//  Every number in an answer is read from the loaded dataset and
//  every explanation comes from the glossary below. So it:
//    • can never invent a figure (good for the Validity score)
//    • works offline, with no API key and no cost
//  To add knowledge, add an entry to GLOSSARY or a rule in answer().
// =============================================================
import { styleFor } from './config.js';
import { getManifest, getVariable, getSeries, getCountrySeries, getPlaceSeries, countryRanking, worldSummary, latestRank, trendDisplay, isDemo } from './data.js';
import { findPlaces } from './search.js';
import { icon } from './icons.js';
import { crossCheck, checkInfo } from './crosscheck.js';
import { summary, evidenceLabel, headline } from './story.js';
import { citation, methods, areaText } from './exporter.js';
import { fmt, signed } from './util.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- which variable is the question about? ----------
const VAR_WORDS = {
  soil_moisture: /\b(soil|moisture|ground ?water|wetness)\b/,
  temperature: /\b(temperature|temp|warm\w*|hot\w*|heat\w*|cool\w*|cold\w*)\b/,
  precipitation: /\b(rain\w*|precipitation|wet\w*|dri\w*|dry\w*|drought\w*)\b/,
  vegetation: /\b(vegetation|ndvi|green\w*|forest\w*|deforest\w*|plants?|trees?)\b/,
  fire: /\b(fires?|wildfires?|burn\w*)\b/,
};
function detectVariable(t) {
  for (const v of getManifest().variables) {
    if (VAR_WORDS[v.id] && VAR_WORDS[v.id].test(t)) return v.id;
    if (t.includes(v.label.toLowerCase())) return v.id;
  }
  return null;
}

// ---------- glossary: general questions about the topic ----------
const GLOSSARY = [
  [/\bndvi\b|vegetation index|greenness/, 'NDVI', 'The <b>Normalized Difference Vegetation Index</b> measures how green the land is from space, using the way healthy leaves reflect near-infrared light and absorb red light. It runs from −1 to 1: dense healthy vegetation is high (roughly 0.6 to 0.9), deserts and bare soil are low (around 0.1), and water or snow sit near or below zero.'],
  [/p[- ]?value|\bp value\b/, 'p-value', 'The <b>p-value</b> is the chance of seeing a trend at least this strong if there were really <i>no</i> trend at all. Small is convincing: below 0.05 we call the change "statistically significant". It says nothing about how big the change is or what caused it.'],
  [/diverg\w*|inconsisten\w*|disagree\w*|variance note/, 'cross-dataset checks', 'Every trend is re-tested on a second, independent NASA record. A <b>Cross-Dataset Divergence Note</b> means both records show statistically significant trends in opposite directions, so the result is unresolved. A <b>Cross-Dataset Inconsistency Note</b> is milder: the second record points the other way but not significantly, so it does not support the trend without clearly contradicting it. Places with either note are left out of the Hotspots rankings.'],
  [/jump|step[- ]?change|sudden|fake trend/, 'sudden jumps', 'A <b>sudden jump</b> is when a place changes in one step instead of steadily, for example a drought that starts in one year, or a change in the satellites or model inputs behind the data. TerraTrace compares a straight line with a single step for every significant trend. If the step fits much better, the report shows a <b>Sudden jump</b> warning, so you describe it as a shift, not a steady trend per decade. About 1–7% of significant trends get this warning.'],
  [/auto-?correlat\w*|hamed|rao\b/, 'autocorrelation', '<b>Autocorrelation</b> means one year\'s value depends on the year before, like a dry year leaving the soil dry the next year too. That makes the basic Mann–Kendall test over-confident. TerraTrace corrects for it with the Hamed–Rao (1998) method on every trend. We checked: 92–98% of significant trends stay significant after the correction.'],
  [/mann[- ]?kendall/, 'Mann–Kendall test', 'The <b>Mann–Kendall test</b> compares every pair of years and counts how often the later year is higher versus lower. If "higher" wins far more often than chance would allow, there is a real upward trend. It does not assume the data follows a bell curve, which is why climate scientists use it. TerraTrace also applies the Hamed–Rao correction, so years that simply follow on from each other (autocorrelation) cannot make a trend look more certain than it is.'],
  [/sen'?s? slope|theil/, "Sen's slope", "<b>Sen's slope</b> is the median of the slopes between every pair of years. Because it uses the median, one freak year cannot drag the result the way it can with an ordinary straight-line fit. TerraTrace reports it per decade."],
  [/confidence interval|\bci\b|error bar|uncertaint\w*/, 'confidence interval', 'A <b>95% confidence interval</b> is the range the true rate of change very probably lies in (we are 95% confident). If the whole range is above zero, the variable is very likely rising; if it crosses zero, we can\'t be sure of the direction. TerraTrace calculates it for Sen\'s slope using the standard non-parametric method (Gilbert, 1987).'],
  [/soil moisture|soil wetness|root zone/, 'soil moisture', '<b>Root-zone soil moisture</b> is how wet the top metre of soil is, from 0 (completely dry) to 1 (completely saturated). TerraTrace uses NASA\'s MERRA-2 model value (GWETROOT) via NASA POWER. It links rain, heat and plants: dry soil stresses crops even when rainfall looks normal.'],
  [/seasonal|season/, 'seasonal cycle', 'Most variables go up and down every year with the <b>seasons</b>. That regular cycle can hide a long-term trend, so TerraTrace first averages each year into one value (the annual mean), which removes the seasonal cycle before testing for a trend.'],
  [/significan\w*|faded|fade/, 'statistical significance', 'A change is <b>statistically significant</b> here when the Mann–Kendall p-value is below 0.05, meaning the trend is very unlikely to be random year-to-year noise. On the globe, bold colour means significant and <b>faded</b> colour means "could just be noise".'],
  [/anomal\w*|baseline/, 'anomaly', 'An <b>anomaly</b> is the difference from a normal baseline, rather than the raw value. In Timeline view the baseline is each place\'s own average over the first five years, so you see change instead of "the Sahara is hot".'],
  [/grid ?cell|resolution|pixel|how accurate|how precise/, 'grid cells', 'The data is stored on a grid. Each <b>grid cell</b> is an average over a square of land or sea (see the note at the bottom of a report for the cell size), not a reading from one weather station. A city and the mountains next to it can share a cell, so treat values as regional.'],
  [/weather.*climate|climate.*weather/, 'weather vs climate', '<b>Weather</b> is what happens day to day. <b>Climate</b> is the long-term pattern, usually averaged over about 30 years. That is why one cold winter does not cancel a warming trend, and why a 24-year record like this one is on the short side.'],
  [/reanalysis|merra/, 'reanalysis', 'A <b>reanalysis</b> (such as NASA\'s MERRA-2) feeds decades of satellite and ground observations into a weather model to produce a complete, gap-free picture of the atmosphere everywhere on Earth. It is consistent and global, but it is a blend of model and measurements, not pure observation.'],
  [/nasa power|\bpower (api|data|project)\b/, 'NASA POWER', '<b>NASA POWER</b> (Prediction Of Worldwide Energy Resources) is a NASA Langley project that serves free solar and weather data for any point on Earth through a simple web API, with no login.'],
  [/modis/, 'MODIS', '<b>MODIS</b> is an instrument flying on NASA\'s Terra and Aqua satellites since around 2000. It images the whole Earth every one to two days and is the source of many long vegetation and fire records.'],
  [/firms/, 'FIRMS', '<b>FIRMS</b> (Fire Information for Resource Management System) is NASA\'s service for active-fire detections spotted by satellite sensors such as MODIS and VIIRS.'],
  [/stripes/, 'climate stripes', '<b>Climate stripes</b> show one coloured bar per year: cool colours for years below the place\'s average, warm colours for years above. The idea comes from climate scientist Ed Hawkins (#ShowYourStripes).'],
  [/per decade|decade/, '"per decade"', 'Trends are given <b>per decade</b>: how much the value changes every 10 years on average. Multiply by 2.3 for the change across this 23-year span.'],
  [/el ni[nñ]o|la ni[nñ]a|enso/, 'El Niño', '<b>El Niño</b> is a natural warming of the tropical Pacific every few years that shifts rainfall and temperature around the world for a year or so (La Niña is the cool opposite). In a short record it can create bumps that look like trends, which is one reason to test significance.'],
  [/climate change|global warming|greenhouse/, 'climate change', '<b>Climate change</b> is a long-term shift in average conditions. The scientific consensus (IPCC) is that the warming since the 1800s is mainly caused by greenhouse gases from burning fossil fuels. TerraTrace shows <i>where and how fast</i> things are changing; it does not by itself prove the cause at one location.'],
  [/trend/, 'trend', 'A <b>trend</b> is the long-term direction once year-to-year wiggles are averaged out. TerraTrace measures its size with Sen\'s slope and checks it is real with the Mann–Kendall test.'],
];
const DEFINE = /^(what('s| is| are| does| do)|define|explain|meaning of|tell me about|how (does|do|is))\b/;

const WHY = {
  temperature: 'global greenhouse warming, local land-use change and growing cities (the urban heat island), changes in cloud or snow cover, and natural cycles such as El Niño',
  precipitation: 'shifting storm tracks and monsoons, natural cycles such as El Niño, warmer air holding more moisture, and regional changes in land cover',
  vegetation: 'deforestation or regrowth, farming and irrigation, drought or extra rainfall, fires, and longer growing seasons in cold regions',
  fire: 'hotter and drier conditions, land clearing and farming practices, fuel build-up, and changes in how fires are managed or detected',
};

// ---------- guided "data detective" flow ----------
// The challenge suggests: ask the user what/where they want to investigate, then suggest variables.
const DETECTIVE = [
  { key: 'city', label: 'A big city', ic: 'city', vars: ['temperature', 'precipitation'], place: { name: 'Mexico City', sub: 'Mexico', lat: 19.43, lon: -99.13 },
    why: 'Big cities are often warming faster than the land around them, partly because concrete and traffic trap heat (the "urban heat island").' },
  { key: 'desert', label: 'A desert edge', ic: 'desert', vars: ['precipitation', 'soil_moisture', 'vegetation'], place: { name: 'Central Chile', sub: 'Chile', lat: -37.0, lon: -72.5 },
    why: 'Central Chile sits between the Atacama Desert and the green south. Since 2010 a long “megadrought” has hit the region, so small changes in rain decide whether land stays green. Rainfall and soil moisture are the variables to watch.' },
  { key: 'rainforest', label: 'A rainforest', ic: 'rainforest', vars: ['vegetation', 'fire', 'precipitation'], place: { name: 'Rondônia, Brazil', sub: 'Brazil', lat: -10.9, lon: -62.8 },
    why: 'Rainforests show deforestation and drought stress. Vegetation greenness (NDVI) is the clearest signal, and fires often follow clearing.' },
  { key: 'arctic', label: 'The Arctic', ic: 'arctic', vars: ['temperature'], place: { name: 'Novaya Zemlya', sub: 'Russian Arctic', lat: 73.0, lon: 57.0 },
    why: 'The Arctic is warming several times faster than the global average, because melting snow and ice expose darker ground and sea that absorb more sunlight.' },
  { key: 'farmland', label: 'Farmland', ic: 'farmland', vars: ['soil_moisture', 'precipitation', 'vegetation'], place: { name: 'Ganges plain', sub: 'India', lat: 27.0, lon: 79.0 },
    why: 'Farms depend on water. Soil moisture shows whether the ground is drying out even when rainfall looks normal, and NDVI shows how crops respond.' },
  { key: 'fire', label: 'Fire country', ic: 'fire', vars: ['fire', 'temperature', 'soil_moisture'], place: { name: 'Northern California', sub: 'USA', lat: 39.5, lon: -121.5 },
    why: 'Hotter, drier conditions make fire seasons longer. Check temperature and soil moisture for the same place (and fire counts, if that layer is loaded).' },
  { key: 'home', label: 'My own place', ic: 'home', why: 'Type the name of your city or country below, for example "How is Ras Al Khaimah changing?".' },
  { key: 'opposite', label: 'Same cause, opposite trends', ic: 'opposite', why: '' },
];
const firstAvailable = (ids) => ids.find((id) => getVariable(id)) || getManifest().variables[0].id;
function detectiveChips() { return DETECTIVE.map((d) => ({ label: d.label, ask: `investigate ${d.key}`, ic: icon(d.ic) })); }

// ---------- helpers ----------
function seriesFor(place, vid, ctx) {
  if (!place) return null;
  if (place === ctx.place) return getPlaceSeries(vid, place, ctx.scope);
  return place.kind === 'country' ? getCountrySeries(vid, place.name) : getSeries(vid, place.lat, place.lon);
}
const nameOf = (place, ctx) => (place === ctx.place && ctx.scope === 'country' && place.country ? place.country : place.name);
const trendText = (s) => (trendDisplay(s.variable) === 'absolute'
  ? `${signed(s.trend.per_decade, Math.max(1, s.decimals))} ${s.unit}`
  : `${signed(s.trend.rel_per_decade, 1)}%`) + ' per decade';
const demoNote = () => (isDemo() ? '<p class="chat-demo">Note: the app is running on DEMO data, so these numbers are synthetic.</p>' : '');

function goAction(place, vid, ctx) {
  const p0 = ctx.place;
  if (place === p0 || (p0 && Math.abs(p0.lat - place.lat) < 0.5 && Math.abs(p0.lon - place.lon) < 0.5)) return []; // already open
  return [{ label: `Open report: ${place.name}`, run: () => ctx.api.select(place.lat, place.lon, place.kind === 'country' ? { country: place.name, scope: 'country', variable: vid } : { name: place.name, sub: place.sub, scope: 'point', variable: vid }) }];
}

let lastPlace = null;
/** Call when the user picks a new place on the globe, so "here" means that place again. */
export function resetFocus() { lastPlace = null; }

/**
 * Answer a question.  ctx = { place, variable, scope, api: { select, setVariable, toggleHotspots, setMode } }
 * Returns { html, actions: [{label, run}], suggestions: [string] }
 */
export function answer(text, ctx) {
  const t = text.toLowerCase().trim();
  const vars = getManifest().variables;
  const vid = detectVariable(t) || ctx.variable;
  const v = getVariable(vid);
  const st = styleFor(vid);
  const noun = st.noun.toLowerCase();
  const found = findPlaces(text);
  // "rainfall in Atlantis": a place was named but we don't know it. Say so instead of
  // silently answering about the previous place.
  if (!found.length) {
    const m = text.match(/\b(?:in|for|at|near|of|around)\s+([A-Za-zÀ-ÿ'’.-]{3,}(?:\s+[A-Za-zÀ-ÿ'’.-]{2,}){0,3})\s*\??$/i);
    const skip = /^(this|that|the|it|here|there|my|our|your|me|general|total|average|detail|details|words|short|report|percent|order|future|past|decades?|years?|the world|world|earth|globe|space|data|degrees?|celsius|mm|summer|winter|spring|autumn|fall|recent years?|this place|this area|this region|english|plain english|practice|class|school|science|statistics|maths?|math)$/i;
    const m2 = !m && text.match(/\bhow (?:is|are|has|have)\s+([A-Za-zÀ-ÿ'’.-]{3,}(?:\s+[A-Za-zÀ-ÿ'’.-]{2,}){0,3})\s+(?:changing|changed|doing|warming|cooling|drying)\b/i);
    if (m2 && !skip.test(m2[1].trim()) && !/^(it|this|that|things|the weather|the climate|climate)$/i.test(m2[1].trim())) {
      return { html: `<p>I couldn't find <b>${esc(m2[1].trim())}</b> in my list of places. Try a nearby city or the country name, or click the spot on the globe and ask again.</p>`, actions: [], suggestions: ['How is Dubai changing?', 'help'] };
    }
    if (m && !skip.test(m[1].trim()) && !/^\d/.test(m[1]) && !detectVariable(m[1].toLowerCase()) && !/\b(rain|heat|temperature|moisture|vegetation|green|fire|trend|change|significan)/i.test(m[1])) {
      const q = m[1].trim().replace(/[?.!]+$/, '');
      return { html: `<p>I couldn't find <b>${esc(q)}</b> in my list of places. Try a nearby city or the country name, or click the spot on the globe and ask again.</p>`, actions: [], suggestions: ['How is Dubai changing?', 'Rainfall in Punjab', 'help'] };
    }
  }
  if (found.length) lastPlace = found[found.length - 1];
  const prev = lastPlace && !found.includes(lastPlace) ? lastPlace : null;
  const here = (found.length ? null : lastPlace) || ctx.place; // "it / there" = the place we last talked about
  const hereName = here ? nameOf(here, ctx) : null;
  const baseSugg = here
    ? [`Is the change in ${hereName} significant?`, `Why might ${noun} be changing here?`, `Which countries are changing fastest?`]
    : ['How is Dubai changing?', 'Which countries are warming fastest?', 'What is NDVI?'];

  // ---- help ----
  // ---- guided investigation ----
  const inv = t.match(/^investigate\s*(\w*)/);
  if (inv) {
    const d = DETECTIVE.find((x) => x.key === inv[1]);
    if (!d) return { html: '<p><b>Let\'s be data detectives.</b> What kind of place do you want to investigate?</p>', actions: [], quick: detectiveChips(), suggestions: [] };
    if (d.key === 'home') return { html: `<p>${d.why}</p>`, actions: [], suggestions: ['How is Ras Al Khaimah changing?', 'How is Stirling changing?'] };
    if (d.key === 'opposite') {
      const pv = firstAvailable(['precipitation', 'soil_moisture']);
      const pvl = getVariable(pv).label.toLowerCase();
      // Fixed, well-documented example (the automatic top-ranked places can be data artefacts).
      const wet = null, dry = { name: 'Central Chile', lat: -37.0, lon: -72.5 };
      return {
        html: `<p>The challenge points out that <b>one process can push a variable in opposite directions in different places</b>. Rainfall is the classic example: as the planet warms, the air holds more water, so many wet regions get wetter while many dry regions get drier.</p>
          <p>I've switched the globe to <b>${esc(pvl)} trends</b>. Look for green and brown areas side by side.${wet && dry ? ` In this data, <b>${esc(wet.name)}</b> shows one of the biggest significant increases and <b>${esc(dry.name)}</b> one of the biggest decreases.` : ' A well-documented example of drying is <b>Central Chile</b> (the “megadrought”). Then look for regions getting wetter, and check their year-by-year chart for sudden jumps before you trust them.'}</p>${demoNote()}`,
        actions: [
          ...(wet ? [{ label: `Open ${wet.name}`, run: () => ctx.api.select(wet.lat, wet.lon, { country: wet.name, scope: 'country', variable: pv }) }] : []),
          ...(dry ? [{ label: `Open ${dry.name}`, run: () => ctx.api.select(dry.lat, dry.lon, { name: dry.name, variable: pv }) }] : []),
        ],
        auto: () => { ctx.api.setVariable(pv); ctx.api.setMode('trend'); ctx.api.flyTo(10, 20, 2.6); },
        suggestions: wet && dry ? [`Compare ${wet.name} and ${dry.name}`, 'What does "significant" mean?'] : ['What does "significant" mean?'],
      };
    }
    const vid0 = firstAvailable(d.vars), vlab = getVariable(vid0).label;
    const others = d.vars.filter((x) => x !== vid0 && getVariable(x)).map((x) => getVariable(x).label.toLowerCase());
    const sx = getSeries(vid0, d.place.lat, d.place.lon);
    lastPlace = { ...d.place, kind: 'city' };
    return {
      html: `<p><b>${esc(d.label)}:</b> ${d.why}</p>
        <p>Variable to start with: <b>${esc(vlab)}</b>${others.length ? `, then try ${esc(others.join(' and '))}` : ''}. Example place: <b>${esc(d.place.name)}</b>, which I've opened for you.</p>
        ${sx ? `<p class="chat-sub">First finding: ${esc(summary(sx, d.place.name))}</p>` : ''}${demoNote()}`,
      actions: [],
      auto: () => ctx.api.select(d.place.lat, d.place.lon, { name: d.place.name, sub: d.place.sub, scope: 'point', variable: vid0 }),
      suggestions: [`Is that significant?`, `Why might this be happening?`, `Show me everything about ${d.place.name}`],
    };
  }

  if (!t || /^(hi|hello|hey)\b|\bhelp\b|what can (you|i)|how do i use|how does this (app|site|work)/.test(t)) {
    return {
      quick: detectiveChips(),
      html: `<p><b>Let's be data detectives.</b> Pick a kind of place below and I'll suggest which NASA variables to investigate, or just ask me anything:</p><ul>
        <li><b>A place:</b> "How is Kenya changing?" · "Rainfall in Stirling"</li>
        <li><b>A comparison:</b> "Compare Dubai and London"</li>
        <li><b>A ranking:</b> "Which countries are warming fastest?"</li>
        <li><b>A year:</b> "What was the temperature in Brazil in 2015?"</li>
        <li><b>A concept:</b> "What is a p-value?" · "What is NDVI?"</li>
        <li><b>Your report:</b> "How do I cite this?" · "Write my methods paragraph"</li></ul>
        <p>Every number I give is read straight from the loaded dataset. I never guess.</p>`,
      actions: [], suggestions: baseSugg,
    };
  }

  // ---- glossary (definition-style questions, or a bare term) ----
  const isDefine = DEFINE.test(t) || t.split(/\s+/).length <= 3;
  if (isDefine && !found.length && !/\b(here|there|this|that|it|changing|\d{4})\b/.test(t)) {
    const g = GLOSSARY.find(([re]) => re.test(t));
    if (g) return { html: `<p>${g[2]}</p>`, actions: [], suggestions: ['What is a p-value?', "What is Sen's slope?", 'What is a grid cell?'].filter((q) => !q.toLowerCase().includes(g[1].toLowerCase())) };
  }

  // ---- citing / methods / source ----
  if (/\b(cite|citation|reference|bibliograph\w*|harvard|apa|bibtex)\b/.test(t)) {
    const s = here ? seriesFor(here, vid, ctx) : null;
    if (!s) return { html: '<p>Pick a place first (click the globe or ask me about one), then I can give you the exact citation for the dataset behind it.</p>', actions: [], suggestions: baseSugg };
    const style = /harvard/.test(t) ? 'harvard' : /bibtex/.test(t) ? 'bibtex' : 'apa';
    const c = citation(s, style);
    return { html: `<p>Cite the <b>dataset</b>, not this app. ${style.toUpperCase()} style:</p><pre>${esc(c)}</pre>`, actions: [{ label: 'Copy citation', run: () => navigator.clipboard?.writeText(c) }], suggestions: ['Write my methods paragraph', 'Where does the data come from?'] };
  }
  if (/\bmethod\w*\b|how (was|is) (this|it|the data) (calculated|computed|made|analysed|analyzed)/.test(t)) {
    const s = here ? seriesFor(here, vid, ctx) : null;
    if (!s) return { html: '<p>In short: annual values per grid cell, a Mann–Kendall test to check whether a trend is real, and Sen\'s slope for its size. Pick a place and I will write the full methods paragraph for it.</p>', actions: [], suggestions: ['What is the Mann–Kendall test?', "What is Sen's slope?"] };
    const m = methods(s, hereName);
    return { html: `<p>Methods paragraph for your report (check it against your own wording rules):</p><pre>${esc(m)}</pre>`, actions: [{ label: 'Copy paragraph', run: () => navigator.clipboard?.writeText(m) }], suggestions: ['How do I cite this?', 'What are the limitations?'] };
  }
  if (/\b(source|sources|where (does|is|did) .*data|which (satellite|dataset)|data from)\b/.test(t)) {
    const list = vars.map((x) => `<li><b>${esc(x.label)}:</b> ${esc(x.source.name)}${x.source.dataset ? ' · ' + esc(x.source.dataset) : ''}</li>`).join('');
    return { html: `<p>The loaded dataset uses:</p><ul>${list}</ul>${demoNote()}`, actions: [], suggestions: ['What is NASA POWER?', 'What is a reanalysis?', 'How do I cite this?'] };
  }
  if (/\b(limit\w*|reliab\w*|trust|accura\w*|caveat\w*|weakness\w*)\b/.test(t)) {
    return { html: `<p>Be upfront about these in your report:</p><ul>
      <li>Values are <b>regional averages</b> over grid cells, not station readings.</li>
      <li>The record is <b>short for climate</b> (${vars.length ? getSeriesYears(vid) : ''}); natural cycles can hide or fake a trend.</li>
      <li>A significant trend shows <b>that</b> something changed, not <b>why</b>.</li>
      <li>Country figures average every cell whose centre falls inside the border, so small countries rest on very few cells.</li>
      <li><b>Rainfall</b> comes from NASA GPCP (satellites and rain gauges). We switched from MERRA-2 rainfall because it jumps suddenly in parts of Africa and Asia when its rain-gauge input changes; MERRA-2 is now only a check. Even GPCP has a small calibration change in 2014, so always look at the year-by-year chart: a trend made by one sudden step is not a real trend.</li>
      <li>MERRA-2 is a <b>reanalysis</b> (a weather model guided by observations). It is less reliable where observations are sparse, such as ice sheets, the high Arctic and parts of Africa, so check surprising results there against another source.</li></ul>${demoNote()}`, actions: [], suggestions: ['What is a grid cell?', 'What is a p-value?'] };
  }

  // ---- rankings ----
  if (/\b(fastest|slowest|most|least|top|biggest|largest|worst|hotspots?|rank\w*)\b|which (country|countries|place|places|region|regions)|where .*(warming|cooling|changing|drying|greening|burning)/.test(t) && found.length < 2) {
    const r = countryRanking(vid, 5);
    const row = (x) => `<li><b>${esc(x.name)}</b> <span>${trendDisplay(vid) === 'absolute' ? signed(x.t.per_decade, Math.max(1, v.decimals ?? 2)) + ' ' + v.unit : signed(x.v, 0) + '%'}/decade</span></li>`;
    const wantDown = /\b(cooling|drying|falling|decreas\w*|declin\w*|losing|least|slowest)\b/.test(t);
    const first = wantDown ? r.down : r.up, second = wantDown ? r.up : r.down;
    let html = `<p><b>${esc(v.label)}</b>: countries with the largest statistically significant ${wantDown ? 'decreases' : 'increases'} (country averages):</p>`;
    html += first.length ? `<ol class="chat-rank">${first.map(row).join('')}</ol>` : '<p>None are statistically significant.</p>';
    if (second.length) html += `<p>Largest ${wantDown ? 'increases' : 'decreases'}:</p><ol class="chat-rank">${second.slice(0, 3).map(row).join('')}</ol>`;
    if (r.hidden) html += `<p class="muted">${r.hidden} ${r.hidden === 1 ? 'country was' : 'countries were'} left out because a second, independent NASA dataset shows the trend going the opposite way there. A trend two datasets disagree on isn't a safe headline.</p>`;
    const top = first[0];
    return {
      html: html + demoNote(),
      actions: [
        ...(top ? [{ label: `Open report: ${top.name}`, run: () => ctx.api.select(top.lat, top.lon, { country: top.name, scope: 'country', variable: vid }) }] : []),
        { label: 'Open Hotspots panel', run: () => ctx.api.openHotspots() },
      ],
      suggestions: top ? [`Why might ${noun} be changing in ${top.name}?`, `Compare ${top.name} and ${first[1]?.name || 'India'}`] : baseSugg,
    };
  }

  // ---- whole world ----
  if (/\b(world|global\w*|planet|earth|worldwide|overall|everywhere)\b/.test(t) && !found.length) {
    const w = worldSummary(vid);
    if (!w) return { html: '<p>No data is loaded for that variable.</p>', actions: [], suggestions: baseSugg };
    return {
      html: `<p>Across the mapped area for <b>${esc(v.label.toLowerCase())}</b>: <b>${fmt(w.up, 0)}%</b> shows a statistically significant increase, <b>${fmt(w.down, 0)}%</b> a significant decrease, and the remaining ${fmt(100 - w.up - w.down, 0)}% has no statistically significant trend in this record (which is not the same as no change). The area-weighted average change is ${signed(w.mean_per_decade, Math.max(1, v.decimals ?? 2))} ${esc(v.unit)} per decade.</p>${demoNote()}`,
      actions: [{ label: 'Show on globe', run: () => { ctx.api.setVariable(vid); ctx.api.setMode('trend'); } }],
      suggestions: [`Which countries are changing fastest?`, 'What does "significant" mean?'],
    };
  }

  // ---- comparisons ----
  const wantsCompare = /\b(compare|vs|versus|than|difference between)\b/.test(t);
  const other = prev || ctx.place;
  if (found.length >= 2 || (wantsCompare && found.length === 1 && other)) {
    const A = found.length >= 2 ? found[0] : other, B = found.length >= 2 ? found[1] : found[0];
    const sa = seriesFor(A, vid, ctx), sb = seriesFor(B, vid, ctx);
    const an = nameOf(A, ctx), bn = nameOf(B, ctx);
    if (!sa || !sb) return { html: `<p>I don't have ${esc(noun)} data for ${esc(!sa ? an : bn)} (this variable may only cover land).</p>`, actions: [], suggestions: baseSugg };
    const line = (n, s) => `<li><b>${esc(n)}:</b> ${trendText(s)}, ${evidenceLabel(s.trend.p_value).text.toLowerCase()} (latest 5-year average ${fmt(s.trend.last_mean, s.decimals)} ${esc(s.unit)})</li>`;
    const va = Math.abs(sa.trend.per_decade), vb = Math.abs(sb.trend.per_decade);
    const verdict = !sa.trend.significant && !sb.trend.significant ? 'Neither trend is statistically significant over this record, so we cannot yet say which is changing faster.'
      : `${esc(va > vb ? an : bn)} is changing faster${sa.trend.significant && sb.trend.significant ? '' : ', though only one of the two trends is statistically significant'}.`;
    return { html: `<p><b>${esc(v.label)}</b>, ${sa.years[0]} to ${sa.years.at(-1)}:</p><ul>${line(an, sa)}${line(bn, sb)}</ul><p>${verdict}</p>${demoNote()}`, actions: [...goAction(A, vid, ctx), ...goAction(B, vid, ctx)], suggestions: [`Why might ${noun} be changing in ${an}?`, 'What does "significant" mean?'] };
  }

  // ---- questions about one place ----
  const place = found[0] || here;
  if (!place) {
    const g = GLOSSARY.find(([re]) => re.test(t));
    if (g) return { html: `<p>${g[2]}</p>`, actions: [], suggestions: baseSugg };
    return { html: '<p>I can answer that best for a specific place. Click anywhere on the globe, or name a city or country in your question, for example "How is rainfall changing in Kenya?"</p><p>I can also explain terms (try "What is a p-value?") and rank countries.</p>', actions: [], suggestions: baseSugg };
  }
  const pn = nameOf(place, ctx);
  const s = seriesFor(place, vid, ctx);
  const go = goAction(place, vid, ctx);
  if (!s) return { html: `<p>There is no ${esc(noun)} data for ${esc(pn)}. This variable may only cover land, or the area has too few valid years.</p>`, actions: go, suggestions: baseSugg };
  const tr = s.trend;

  // a specific year
  const ym = t.match(/\b(19|20)\d{2}\b/);
  if (ym) {
    const y = +ym[0], i = s.years.indexOf(y);
    if (i < 0) return { html: `<p>The record for ${esc(pn)} covers ${s.years[0]} to ${s.years.at(-1)}, so ${y} is outside it.</p>`, actions: go, suggestions: [`What was the highest year in ${pn}?`] };
    const val = s.values[i];
    if (val === null) return { html: `<p>${y} is marked as missing for ${esc(pn)}: there was not enough valid data that year.</p>`, actions: go, suggestions: baseSugg };
    const valid = s.values.filter((x) => x !== null);
    const rank = valid.filter((x) => x > val).length + 1;
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    return { html: `<p>In <b>${y}</b>, ${esc(noun)} in ${esc(pn)} was <b>${fmt(val, s.decimals)} ${esc(s.unit)}</b>. That is ${signed(val - avg, s.decimals)} ${esc(s.unit)} against the ${s.years[0]}–${s.years.at(-1)} average, and ranks ${rank} of ${valid.length} years (1 = highest).</p>${demoNote()}`, actions: go, suggestions: [`What was the highest year in ${pn}?`, `How is ${pn} changing?`] };
  }
  // extremes
  if (/\b(highest|lowest|hottest|coldest|coolest|warmest|wettest|driest|record|peak|maximum|minimum|extreme\w*|greenest)\b/.test(t)) {
    const rk = latestRank(s);
    return { html: `<p>For ${esc(noun)} in ${esc(pn)}: the highest year was <b>${tr.max.year}</b> (${fmt(tr.max.value, s.decimals)} ${esc(s.unit)}) and the lowest was <b>${tr.min.year}</b> (${fmt(tr.min.value, s.decimals)} ${esc(s.unit)}).${rk ? ` The latest year, ${rk.year}, ranks ${rk.rank} of ${rk.of}.` : ''}</p><p>A good research step: look up what happened in those years (an El Niño, a drought, a major fire season).</p>${demoNote()}`, actions: go, suggestions: [`How is ${pn} changing?`, 'What is El Niño?'] };
  }
  // is it real?
  if (/\b(significan\w*|real|really|sure|certain\w*|confiden\w*|noise|chance|reliable|prove\w*|evidence)\b/.test(t)) {
    const ev = evidenceLabel(tr.p_value, s.years);
    const xc = crossCheck(s);
    const xch = xc ? `<p><b>${esc(xc.badge)}.</b> ${esc(xc.advice)}</p>` : '';
    return { html: `<p><b>${ev.text}.</b> The Mann–Kendall p-value for ${esc(noun)} in ${esc(pn)} is <b>${tr.p_value < 0.001 ? 'below 0.001' : fmt(tr.p_value, 3)}</b>. ${tr.significant ? 'That is under the 0.05 threshold, so a trend this consistent is very unlikely to be random year-to-year variation.' : 'That is above the 0.05 threshold, so the ups and downs between years are big enough that this trend could be chance. Report it as "not statistically significant over this record", not as an increase or decrease, and not as proof that nothing is changing. A longer record may show a clear trend.'}</p><p>It rests on ${tr.n} valid years (${areaText(s)}).</p>${xch}${demoNote()}`, actions: go, suggestions: ['What is a p-value?', `Why might ${noun} be changing here?`] };
  }
  // why?
  if (/\b(why|cause\w*|reason\w*|explain|because|driver\w*|responsible)\b/.test(t)) {
    return { html: `<p>The data shows <b>what</b> is happening in ${esc(pn)} (${trendText(s)}, ${evidenceLabel(tr.p_value, s.years).text.toLowerCase()}), but it cannot tell you <b>why</b>. That part is your investigation.</p><p>For ${esc(noun)}, scientists usually look at: ${WHY[vid] || 'local land-use change, natural climate cycles and long-term global change'}.</p><p>Tip: check the other variables for this place. If two change together, that is a lead worth following (though not proof).</p>`, actions: go, suggestions: [`Show me everything about ${pn}`, 'What is El Niño?'] };
  }
  // coverage
  if (/\b(missing|gaps?|coverage|how many years|complete\w*)\b/.test(t)) {
    return { html: `<p>${esc(pn)} has valid ${esc(noun)} data for <b>${tr.n} of ${s.years.length}</b> years (${fmt(tr.completeness * 100, 0)}%), covering ${s.years[0]} to ${s.years.at(-1)}. Missing years are left blank, never estimated.</p>`, actions: go, suggestions: baseSugg };
  }
  // everything about a place
  if (/\b(everything|overview|all (the )?(data|variables)|fingerprint|summar\w*|profile)\b/.test(t)) {
    const rows = vars.map((x) => {
      const sx = seriesFor(place, x.id, ctx);
      return `<li><b>${esc(x.label)}:</b> ${sx && sx.trend.per_decade !== null ? `${trendText(sx)} <span>(${sx.trend.significant ? 'significant' : 'not significant'})</span>` : 'no data'}</li>`;
    }).join('');
    return { html: `<p>Climate fingerprint for <b>${esc(pn)}</b>:</p><ul>${rows}</ul>${demoNote()}`, actions: go, suggestions: [`Why might ${noun} be changing in ${pn}?`, `Compare ${pn} and London`] };
  }
  // not something I recognise → say so instead of guessing
  if (!found.length && !detectVariable(t) && !/\b(chang\w*|trend\w*|how|what|happen\w*|going|increas\w*|decreas\w*|ris\w*|fall\w*|getting|here|there|tell|show)\b/.test(t)) {
    return { html: '<p>I\'m not sure what you mean. I can answer questions about places, trends, rankings, specific years and climate terms. Type "help" to see examples.</p>', actions: [], suggestions: baseSugg };
  }
  // default: the trend
  return {
    html: `<p>${esc(summary(s, pn))}</p><p class="chat-sub">Based on the ${esc(areaText(s))}.</p>${demoNote()}`,
    actions: go,
    suggestions: [`Is that significant?`, `Why might ${noun} be changing in ${pn}?`, `Show me everything about ${pn}`],
  };
}

function getSeriesYears(vid) {
  const any = countryRanking(vid, 1); // forces grids to be read; years come from any series
  const s = getCountrySeries(vid, (any.up[0] || any.down[0] || {}).name || 'India');
  return s ? `${s.years[0]} to ${s.years.at(-1)}` : 'about two decades';
}
