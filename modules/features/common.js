import { h, stopEvent } from '../core/dom.js';
import { iconSvg } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { logger } from '../core/logger.js';

const SHIELDED = ['pointerdown', 'mousedown', 'mouseup', 'touchstart'];

export function featureButton(feature, { className, iconName, label, text = null, size = 24, stroke = 2, onClick }) {
  const run = async (e) => {
    stopEvent(e);
    try {
      await onClick(button, e);
    } catch (error) {
      logger.error(`[${feature}] action`, error);
      toast.error(error);
    }
  };

  const button = h('div', {
    class: ['ttp-btn', ...[className].flat()],
    role: 'button',
    tabindex: '0',
    title: label,
    'aria-label': label,
    dataset: { ttpFeature: feature },
    on: {
      click: run,
      keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') run(e); }
    }
  },
    h('span', { class: 'ttp-btn-icon', html: iconSvg(iconName, { size, stroke }) }),
    text ? h('span', { class: 'ttp-btn-text' }, text) : null
  );

  SHIELDED.forEach(type => button.addEventListener(type, e => e.stopPropagation()));
  return button;
}

export function removeInjected(feature) {
  document.querySelectorAll(`[data-ttp-feature="${feature}"]`).forEach(el => el.remove());
}
