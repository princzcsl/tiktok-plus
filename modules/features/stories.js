import { t } from '../core/i18n.js';
import { logger } from '../core/logger.js';
import { fetchItem, fetchUser, fetchStories } from '../api/tiktok.js';
import { openMenu } from '../ui/menu.js';
import { runBatch } from '../ui/actions.js';
import { featureButton, removeInjected } from './common.js';
import { resolveItem, itemMenuItems } from './videos.js';

const FEATURE = 'stories';

async function menuItems(anchor) {
  const target = resolveItem(anchor);
  if (!target) return [{ type: 'message', label: t('ITEM_NOT_FOUND'), error: true }];

  const item = await fetchItem(target.id, target.username);
  const username = item.username || target.username;
  logger.info('Story', target.id, username);

  return [
    ...itemMenuItems(item, { scope: target.scope, anchor }),
    username ? { type: 'separator' } : null,
    username ? {
      icon: 'downloadAll',
      label: t('STORIES_DOWNLOAD_ALL'),
      hint: `@${username}`,
      onSelect: () => runBatch(async () => fetchStories(await fetchUser(username)))
    } : null
  ];
}

function shareSlot(card) {
  let slot = card.querySelector('[data-e2e="share-btn"]');
  while (slot?.parentElement && slot.parentElement !== card && slot.parentElement.children.length === 1) {
    slot = slot.parentElement;
  }
  return slot;
}

function inject() {
  for (const card of document.querySelectorAll('section[data-e2e="feed-video"]')) {
    if (card.closest('article') || card.querySelector('.ttp-story-dl')) continue;
    const slot = shareSlot(card);
    if (!slot?.parentElement) continue;

    const button = featureButton(FEATURE, {
      className: 'ttp-story-dl',
      iconName: 'download',
      label: t('DL_BTN'),
      size: 22,
      stroke: 2.4,
      onClick: (anchor) => openMenu(anchor, () => menuItems(anchor), { placement: 'top', minWidth: 250 })
    });
    slot.insertAdjacentElement('beforebegin', button);
  }
}

export const storiesFeature = {
  name: FEATURE,
  routes: '*',
  enter() {},
  scan: inject,
  leave() {
    removeInjected(FEATURE);
  }
};
