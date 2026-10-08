import { h } from '../core/dom.js';

const svg = (body, { size = 24, stroke = 2, fill = 'none' } = {}) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const PATHS = {
  download: '<line x1="12" x2="12" y1="3" y2="16"/><polyline points="16 12 12 16 8 12"/><line x1="4" x2="20" y1="21" y2="21"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="m21 15-5-5L5 21"/>',
  images: '<rect x="7" y="7" width="14" height="14" rx="2.5"/><path d="M17 7V5.5A2.5 2.5 0 0 0 14.5 3h-9A2.5 2.5 0 0 0 3 5.5v9A2.5 2.5 0 0 0 5.5 17H7"/><path d="m21 17-3.5-3.5L11 20"/>',
  video: '<rect x="2.5" y="5" width="14" height="14" rx="3"/><path d="m16.5 10 5-3v10l-5-3"/>',
  play: '<path d="M7 4.5v15a.8.8 0 0 0 1.2.7l12-7.5a.8.8 0 0 0 0-1.4l-12-7.5A.8.8 0 0 0 7 4.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  close: '<line x1="20.6" y1="3.4" x2="3.4" y2="20.6"/><line x1="20.6" y1="20.6" x2="3.4" y2="3.4"/>',
  left: '<polyline points="15 4 7 12 15 20"/>',
  right: '<polyline points="9 4 17 12 9 20"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  volumeOff: '<path d="M11 5 6 9H3v6h3l5 4z"/><line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/>',
  check: '<polyline points="4 12.5 9.5 18 20 6"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5"/>',
  zoom: '<circle cx="11" cy="11" r="6"/><line x1="15.5" y1="15.5" x2="20" y2="20"/>',
  zoomIn: '<circle cx="11" cy="11" r="6"/><line x1="15.5" y1="15.5" x2="20" y2="20"/><line x1="11" y1="8.5" x2="11" y2="13.5"/><line x1="8.5" y1="11" x2="13.5" y2="11"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  square: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/>',
  eyeOff: '<path d="M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.4 3.1"/><path d="M6.6 6.6A17 17 0 0 0 2.5 12s3.5 6 9.5 6a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><line x1="3" y1="3" x2="21" y2="21"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.6" x2="12" y2="8"/>'
};

export function iconSvg(name, options) {
  return svg(PATHS[name] || '', options);
}

export function icon(name, { size = 20, stroke = 2, className = '' } = {}) {
  return h('span', { class: ['ttp-icon', className], html: iconSvg(name, { size, stroke }) });
}
