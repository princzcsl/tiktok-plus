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
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.6" x2="12" y2="8"/>',
  downloadAll: '<line x1="12" x2="12" y1="2" y2="12"/><polyline points="15.5 8.5 12 12 8.5 8.5"/><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  camera: '<path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>',
  speed: '<path d="M12 13.5 16 9"/><path d="M4.5 18a9 9 0 1 1 15 0"/><circle cx="12" cy="13.5" r="1.2" fill="currentColor" stroke="none"/>',
  checkSquare: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><polyline points="8 12.5 11 15.5 16.5 9"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z"/>',
  starFilled: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z" fill="currentColor"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4.1a4 4 0 0 1 0 7.8"/><path d="M22 21a7 7 0 0 0-4.5-6.5"/>',
  fingerprint: '<path d="M12 11v3a8 8 0 0 1-1.5 4.7"/><path d="M8 6.5A6 6 0 0 1 18 11v1.5"/><path d="M6 10a6 6 0 0 1 .5-2.4"/><path d="M8.5 11a3.5 3.5 0 0 1 7 0v2a12 12 0 0 1-1 4.8"/><path d="M6 14.5a14 14 0 0 1 0-3.5"/><path d="M18 16.5a19 19 0 0 1-1 3.5"/><path d="M8 18.5A10 10 0 0 0 8.8 15"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};

export function iconSvg(name, options) {
  return svg(PATHS[name] || '', options);
}

export function icon(name, { size = 20, stroke = 2, className = '' } = {}) {
  return h('span', { class: ['ttp-icon', className], html: iconSvg(name, { size, stroke }) });
}
