import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { logger } from '../core/logger.js';
import { parseRoute } from '../core/router.js';
import { iconSvg } from '../ui/icons.js';
import { openAvatar } from '../ui/avatar.js';
import { openStoryViewer } from '../ui/storyViewer.js';
import { featureButton, removeInjected } from './common.js';

const FEATURE = 'profile';

const currentUsername = () => parseRoute().username;

function injectAvatarOverlay() {
  const avatar = document.querySelector('[data-e2e="user-avatar"]');
  if (!avatar || avatar.querySelector('.ttp-pic-overlay')) return;

  if (getComputedStyle(avatar).position === 'static') avatar.style.position = 'relative';

  const overlay = h('div', {
    class: 'ttp-pic-overlay',
    role: 'button',
    title: t('ZOOM_PP_HINT'),
    'aria-label': t('ZOOM_PP_HINT'),
    dataset: { ttpFeature: FEATURE },
    html: iconSvg('zoomIn', { size: 22, stroke: 2.2 })
  });

  ['pointerdown', 'mousedown', 'mouseup', 'touchstart'].forEach(type => overlay.addEventListener(type, e => e.stopPropagation()));
  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openAvatar(currentUsername());
  });

  avatar.append(overlay);
}

function injectActions() {
  if (document.querySelector('.ttp-profile-actions')) return;
  const title = document.querySelector('[data-e2e="user-title"]');
  if (!title?.parentElement) return;

  const actions = h('div', { class: 'ttp-profile-actions', dataset: { ttpFeature: FEATURE } },
    featureButton(FEATURE, {
      className: 'ttp-pill',
      iconName: 'eyeOff',
      label: t('STORIES_HINT'),
      text: t('STORIES_BTN'),
      size: 16,
      onClick: () => openStoryViewer(currentUsername())
    }),
    featureButton(FEATURE, {
      className: 'ttp-pill',
      iconName: 'zoom',
      label: t('ZOOM_PP_HINT'),
      text: t('ZOOM_PP'),
      size: 16,
      onClick: () => openAvatar(currentUsername())
    })
  );

  title.insertAdjacentElement('afterend', actions);
  logger.success('[profile] Boutons injectés');
}

export const profileFeature = {
  name: FEATURE,
  routes: ['profile'],
  key: (route) => route.username,
  enter() {
    removeInjected(FEATURE);
  },
  scan() {
    injectAvatarOverlay();
    injectActions();
  },
  leave() {
    removeInjected(FEATURE);
  }
};
