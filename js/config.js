// =============================================================
//  config.js — the ONLY file most people need to touch
// =============================================================

export const CONFIG = {
  appName: 'TerraTrace',
  tagline: 'Every place on Earth has a climate story. Find it, prove it, cite it.',

  // TODO(team): put your real team name + members here
  team: {
    name: 'The Hotspot',
    members: ['Sidharth Gopakumar', 'Teammate 2', 'Teammate 3', 'Teammate 4', 'Teammate 5'],
    location: 'Ras Al Khaimah, UAE',
    challenge: 'Be an Earth System Trend Detective',
  },

  // 'auto'  → use real data in data/processed/ if manifest.json exists, else demo data
  // 'mock'  → always demo data   (also: add ?mode=mock to the URL)
  // 'real'  → always real data   (also: add ?mode=real to the URL)
  dataMode: 'auto',
  processedPath: 'data/processed/',

  // From the pipeline log (pipeline/build.py). Shown in the "Data journey".
  pipelineStats: { removedValues: 91008, requested: { soil_moisture: 978 }, extra: ['288 monthly NASA GPCP rainfall files (GES DISC)', '288 monthly NASA GLDAS-2.1 soil-moisture files (GES DISC)', 'the NASA GISTEMP v4 temperature record (GISS)'] },
  pipelineNotes: {
    soil_moisture: '978 land cells requested. 316 cells over ice sheets and coasts returned only NASA fill values (91,008 monthly values) and were removed, leaving 662 cells.',
    precipitation: 'Main layer: NASA GPCP V3.3 (satellites combined with rain gauges), from 288 monthly files. MERRA-2 rainfall is kept only as a check, because in some regions it jumps when its rain-gauge input changes: one cell over Cambodia goes from about 500 to 2,600 mm a year in 2016, while GPCP stays steady.',
  },

  // Statistics settings (keep in sync with pipeline/config.py)
  alpha: 0.05,        // significance level for the Mann-Kendall test
  compareWindow: 5,   // "first 5 years vs last 5 years"

  // Year slider animation speed (ms per year)
  playSpeed: 450,

  // Demo/mock data settings (only used when no real data is present)
  mock: { step: 5, startYear: 2001, endYear: 2024 },

  // How each variable is described in plain language + colour scales.
  // The id must match the variable "id" in data/processed/manifest.json.
  // Unknown ids still work — they just get the generic style.
  styles: {
    temperature: {
      icon: 'temperature', rising: 'warmed', falling: 'cooled', noun: 'Temperature',
      about: 'How warm the air is about 2 metres above the ground, averaged over the whole year. It comes from MERRA-2, a NASA model that blends satellite and weather-station measurements into a complete global picture.',
      why: 'Warming affects health, water supply, crops and energy use. Cities, deserts and the Arctic often warm faster than average.',
      // diverging: blue (cooling) → white → red (warming)
      trendColors: ['#08306b', '#2171b5', '#6baed6', '#d1e5f0', '#f7f7f7', '#fee090', '#fc8d59', '#d7301f', '#67000d'],
      valueColors: ['#313695', '#74add1', '#fee090', '#f46d43', '#a50026'],
      goodWhen: null,
    },
    precipitation: {
      icon: 'precipitation', rising: 'got wetter', falling: 'got drier', noun: 'Rainfall',
      about: 'The total rain and snow that falls in a year, in millimetres (1 mm = 1 litre of water on every square metre). Rainfall varies a lot from year to year, so trends are often harder to prove.',
      why: 'Rainfall decides drought, floods and harvests. A warmer world tends to make many wet regions wetter and dry regions drier: the same process, opposite trends.',
      trendColors: ['#543005', '#8c510a', '#d8b365', '#f6e8c3', '#f5f5f5', '#c7eae5', '#5ab4ac', '#01665e', '#003c30'],
      valueColors: ['#f6e8c3', '#c7eae5', '#5ab4ac', '#01665e', '#003c30'],
      goodWhen: null,
    },
    vegetation: {
      icon: 'vegetation', rising: 'got greener', falling: 'lost vegetation', noun: 'Vegetation (NDVI)',
      about: 'NDVI measures how green and healthy plants are, using the way leaves reflect light, as seen by the MODIS instrument on NASA satellites. It runs from about 0 (bare desert) to 0.9 (dense rainforest).',
      why: 'Greenness reveals deforestation, drought stress, farming changes and longer growing seasons.',
      trendColors: ['#a6611a', '#dfc27d', '#f5f5f5', '#80cdc1', '#1a9641'],
      valueColors: ['#ffffcc', '#c2e699', '#78c679', '#31a354', '#006837'],
      goodWhen: 'rising',
    },
    fire: {
      icon: 'fire', rising: 'saw more fires', falling: 'saw fewer fires', noun: 'Active fires',
      about: 'The number of fires detected by satellites (NASA FIRMS) in a year. Satellites spot the heat of burning areas from space.',
      why: 'Fire activity links climate (heat and drought) with how people use land, such as clearing forests or burning crop stubble.',
      trendColors: ['#1a9850', '#91cf60', '#f7f7f7', '#fc8d59', '#d73027'],
      valueColors: ['#fff5eb', '#fdbe85', '#fd8d3c', '#d94701', '#7f2704'],
      goodWhen: 'falling',
    },
    soil_moisture: {
      icon: 'soil_moisture', rising: 'got wetter underground', falling: 'dried out', noun: 'Soil moisture',
      about: 'How wet the soil is in the top metre where plant roots grow, from 0 (completely dry) to 1 (completely soaked). It comes from NASA\'s MERRA-2 model ("root zone soil wetness").',
      why: 'Soil moisture connects rain, heat and plants: hotter air pulls water out of the ground, and dry soil stresses crops and forests even when rainfall looks normal.',
      trendColors: ['#543005', '#8c510a', '#d8b365', '#f6e8c3', '#f5f5f5', '#c7eae5', '#5ab4ac', '#01665e', '#003c30'],
      valueColors: ['#8c510a', '#d8b365', '#f6e8c3', '#5ab4ac', '#01665e'],
      goodWhen: null,
    },
    _default: {
      icon: '_default', rising: 'increased', falling: 'decreased', noun: 'Value',
      trendColors: ['#3b4cc0', '#9abbff', '#f2f2f2', '#f49a7b', '#b40426'],
      valueColors: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'],
      goodWhen: null,
    },
  },

  // The guided demo (press T, then ↓ / ↑) lives in js/tour.js → CHAPTERS.
};

export function styleFor(id) {
  return CONFIG.styles[id] || CONFIG.styles._default;
}
