import { getSettings, updateSettings, cachedSettings, store } from '../core/storage.js';
import { t } from '../core/i18n.js';
import { openMenu } from '../ui/menu.js';
import { featureButton } from './common.js';

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const label = (rate) => `${String(rate).replace('.', ',')}×`;

function applyTo(video) {
  const rate = cachedSettings().playbackRate || 1;
  if (video.closest?.('.ttp-root')) return;
  if (video.playbackRate !== rate) video.playbackRate = rate;
}

function applyAll() {
  document.querySelectorAll('video').forEach(applyTo);
  document.querySelectorAll('.ttp-speed-btn .ttp-btn-text').forEach(el => { el.textContent = label(cachedSettings().playbackRate || 1); });
}

export async function setSpeed(rate) {
  await updateSettings({ playbackRate: rate });
  applyAll();
}

export function speedButton(feature, layout, vertical) {
  const button = featureButton(feature, {
    className: ['ttp-speed-btn', layout],
    iconName: 'speed',
    label: t('SPEED'),
    text: label(cachedSettings().playbackRate || 1),
    size: vertical ? 20 : 18,
    stroke: 2.2,
    onClick: (anchor) => {
      const current = cachedSettings().playbackRate || 1;
      openMenu(anchor, [
        { type: 'header', label: t('SPEED') },
        ...SPEEDS.map(rate => ({
          icon: rate === current ? 'check' : null,
          label: label(rate),
          hint: rate === 1 ? t('SPEED_NORMAL') : null,
          onSelect: () => setSpeed(rate)
        }))
      ], { placement: vertical ? 'top' : 'bottom', minWidth: 150 });
    }
  });
  return button;
}

export function initSpeed() {
  getSettings().then(applyAll).catch(() => {});
  document.addEventListener('play', (e) => e.target instanceof HTMLVideoElement && applyTo(e.target), true);
  document.addEventListener('loadeddata', (e) => e.target instanceof HTMLVideoElement && applyTo(e.target), true);
  store.onChange('settings', applyAll);
}
