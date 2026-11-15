// Line icons (24×24, stroke) so the UI doesn't depend on emoji fonts.
const P = {
  temperature: '<path d="M10 4a2 2 0 0 1 4 0v9.5a4.5 4.5 0 1 1-4 0z"/><path d="M12 9v7"/><circle cx="12" cy="17" r="1.6" fill="currentColor"/>',
  precipitation: '<path d="M7 15a4 4 0 0 1 .6-7.9A5.5 5.5 0 0 1 18 8.5 3.5 3.5 0 0 1 17.5 15"/><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>',
  vegetation: '<path d="M5 20c0-9 5-14 15-15-1 10-6 15-15 15z"/><path d="M5 20c3-5 6-8 10-10"/>',
  fire: '<path d="M12 3c1 4 5 5.500 5 10.500a5 5 0 0 1-10 0c0-2 1-3.200 2-4.200 0 2 1 3 2 3 0-3-1-6 1-9.300z"/>',
  soil_moisture: '<path d="M3 12h18"/><path d="M3 16h18M3 20h18" opacity=".5"/><path d="M12 3c2 2.500 3 4 3 5.500a3 3 0 0 1-6 0C9 7 10 5.500 12 3z"/>',
  _default: '<path d="M4 18l5-6 4 3 7-9"/><path d="M4 4v16h16"/>',
  city: '<path d="M3 21h18"/><path d="M5 21V9l5-3v15"/><path d="M10 21V4h7v17"/><path d="M13 8h1M13 11h1M13 14h1M7 12h1M7 15h1"/>',
  desert: '<circle cx="16" cy="7" r="3"/><path d="M2 19c3-4 6-4 9-1 3-3 7-3 11 1"/><path d="M2 21h20"/>',
  rainforest: '<path d="M12 21v-6"/><path d="M12 3l6 8h-3l4 5H5l4-5H6z"/>',
  arctic: '<path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  farmland: '<path d="M12 21V9"/><path d="M12 9c-3 0-4-2-4-5 3 0 4 2 4 5zM12 9c3 0 4-2 4-5-3 0-4 2-4 5z"/><path d="M12 15c-3 0-4-2-4-4 3 0 4 1 4 4zM12 15c3 0 4-2 4-4-3 0-4 1-4 4z"/><path d="M4 21h16"/>',
  home: '<path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  opposite: '<path d="M4 8h16M16 4l4 4-4 4"/><path d="M20 16H4M8 12l-4 4 4 4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  warning: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
};
export function icon(id) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[id] || P._default}</svg>`;
}
export const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
export const PAUSE = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
