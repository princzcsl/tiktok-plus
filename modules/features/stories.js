import { t } from '../core/i18n.js';
import { logger } from '../core/logger.js';
import { fetchItem, fetchUser, fetchStories } from '../api/tiktok.js';
import { openMenu } from '../ui/menu.js';
import { runBatch } from '../ui/actions.js';
import { featureButton, removeInjected } from './common.js';
import { resolveItem, itemMenuItems } from './videos.js';
import { getItem } from '../api/pageData.js';

const FEATURE = 'stories';
const POST_ACTIONS = '[data-e2e="like-icon"], [data-e2e="browse-like-icon"]';

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

function resumeWhenFocused(video) {
  const resume = () => { if (video.isConnected && video.paused) video.play().catch(() => {}); };
  if (document.hasFocus()) {
    setTimeout(() => (document.hasFocus() ? resume() : resumeWhenFocused(video)), 400);
    return;
  }
  window.addEventListener('focus', () => setTimeout(resume, 150), { once: true });
}

function shareSlot(card) {
  let slot = card.querySelector('[data-e2e="share-btn"]');
  while (slot?.parentElement && slot.parentElement !== card && slot.parentElement.children.length === 1) {
    slot = slot.parentElement;
  }
  return slot;
}

function playerCard(player) {
  const section = player.closest('section[data-e2e="feed-video"]');
  if (section) return section;
  const target = player.getBoundingClientRect();
  for (let el = player.parentElement; el && el !== document.body; el = el.parentElement) {
    const rect = el.getBoundingClientRect();
    if (rect.width >= target.width - 2 && rect.height >= target.height - 2 && getComputedStyle(el).position !== 'static') return el;
  }
  return player.parentElement;
}

function isStoryCard(card) {
  if (card.querySelector(POST_ACTIONS) || card.closest('article')?.querySelector(POST_ACTIONS)) return false;
  if (card.querySelector('[data-e2e="share-btn"]')) return true;
  const target = resolveItem(card);
  return Boolean(target && getItem(target.id)?.isStory);
}

function storyCards() {
  const cards = new Set(document.querySelectorAll('section[data-e2e="feed-video"]'));
  for (const player of document.querySelectorAll('[id^="xgwrapper-"]')) {
    const id = player.id.match(/(\d{8,})$/)?.[1];
    if (id && getItem(id)?.isStory) cards.add(playerCard(player));
  }
  return [...cards].filter(card => card && !card.closest('.ttp-root') && isStoryCard(card));
}

function inject() {
  for (const card of storyCards()) {
    if (card.querySelector('.ttp-story-dl')) continue;
    const slot = shareSlot(card);
    const floating = !slot?.parentElement;

    const button = featureButton(FEATURE, {
      className: ['ttp-story-dl', floating && 'ttp-story-dl--floating'].filter(Boolean),
      iconName: 'download',
      label: t('DL_BTN'),
      size: 22,
      stroke: 2.4,
      onClick: (anchor) => {
        const video = card.querySelector('video');
        const wasPlaying = Boolean(video && !video.paused);
        if (wasPlaying) video.pause();
        openMenu(anchor, () => menuItems(anchor), {
          placement: 'top',
          minWidth: 250,
          onClose: () => { if (wasPlaying) resumeWhenFocused(video); }
        });
      }
    });
    if (floating) {
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      card.append(button);
    } else {
      slot.insertAdjacentElement('beforebegin', button);
    }
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
