import { h, copyText } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { logger } from '../core/logger.js';
import { parseRoute } from '../core/router.js';
import { fetchUser } from '../api/tiktok.js';
import { isMarked, mark, unmark } from '../services/ids.js';
import { iconSvg } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { openAvatar } from '../ui/avatar.js';
import { openStoryViewer } from '../ui/storyViewer.js';
import { openPanel } from '../ui/panel.js';
import { featureButton, removeInjected } from './common.js';
import { startSelection, stopSelection, isSelecting } from './tiles.js';

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


async function idMenuItems() {
  const user = await fetchUser(currentUsername());
  const marked = await isMarked(user.id);

  return [
    { type: 'header', label: `@${user.username}`, sublabel: `ID ${user.id}` },
    {
      icon: 'copy',
      label: t('COPY_ID'),
      hint: user.id,
      onSelect: async () => {
        await copyText(user.id);
        toast.success(t('ID_COPIED'));
      }
    },
    {
      icon: marked ? 'starFilled' : 'star',
      label: t(marked ? 'UNMARK' : 'MARK_ID'),
      onSelect: async () => {
        if (marked) await unmark(user.id);
        else await mark(user);
        toast.success(t(marked ? 'UNMARKED_TOAST' : 'MARKED_TOAST'));
      }
    },
    { type: 'separator' },
    { icon: 'users', label: t('PANEL_IDS'), onSelect: () => openPanel({ tab: 'ids' }) }
  ];
}

function bindUsername() {
  const subtitle = document.querySelector('[data-e2e="user-subtitle"]');
  if (!subtitle || subtitle.dataset.ttpBound) return;
  subtitle.dataset.ttpBound = '1';
  subtitle.classList.add('ttp-username');
  subtitle.title = t('ID_HINT');
  subtitle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu(subtitle, idMenuItems, { minWidth: 230 });
  });
}


function selectButton() {
  const button = featureButton(FEATURE, {
    className: ['ttp-pill', 'ttp-select-pill'],
    iconName: 'checkSquare',
    label: t('SELECT_HINT'),
    text: t('SELECT'),
    size: 16,
    onClick: () => {
      if (isSelecting()) stopSelection();
      else startSelection();
    }
  });
  return button;
}

function injectActions() {
  const existing = document.querySelector('.ttp-profile-actions');
  existing?.querySelector('.ttp-select-pill')?.classList.toggle('ttp-on', isSelecting());
  if (existing) return;

  const subtitle = document.querySelector('[data-e2e="user-subtitle"]');
  const title = document.querySelector('[data-e2e="user-title"]');
  const anchor = subtitle?.parentElement?.parentElement ? subtitle.parentElement : title;
  if (!anchor?.parentElement) return;

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
    }),
    selectButton(),
    featureButton(FEATURE, {
      className: ['ttp-pill', 'ttp-pill--icon'],
      iconName: 'settings',
      label: t('PANEL_TITLE'),
      size: 16,
      onClick: () => openPanel()
    })
  );

  anchor.insertAdjacentElement('afterend', actions);
  logger.success('[profile] Boutons injectés');
}

export const profileFeature = {
  name: FEATURE,
  routes: ['profile'],
  key: (route) => route.username,
  enter() {
    removeInjected(FEATURE);
    stopSelection();
  },
  scan() {
    injectAvatarOverlay();
    bindUsername();
    injectActions();
  },
  leave() {
    removeInjected(FEATURE);
  }
};
