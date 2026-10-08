import { mediaKey } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { logger } from '../core/logger.js';
import { parseRoute } from '../core/router.js';
import { fetchItem } from '../api/tiktok.js';
import { findItemByMediaKeys } from '../api/pageData.js';
import { downloadVideo, downloadThumbnail, downloadPhoto } from '../services/downloads.js';
import { openMenu } from '../ui/menu.js';
import { runDownload, runDownloadPhotos } from '../ui/actions.js';
import { openImageViewer } from '../ui/imageViewer.js';
import { featureButton, removeInjected } from './common.js';

const FEATURE = 'videos';

const LIKE_ICONS = '[data-e2e="like-icon"], [data-e2e="browse-like-icon"], [data-e2e="video-player-like-icon"]';
const SIBLING_ICONS = '[data-e2e="share-icon"], [data-e2e="browse-share-icon"], [data-e2e="comment-icon"], [data-e2e="browse-comment-icon"]';
const SHARE_ICONS = '[data-e2e="share-icon"], [data-e2e="browse-share-icon"]';
const ITEM_SCOPES = 'article, [data-e2e="recommend-list-item-container"], [data-e2e="feed-video"], [class*="DivItemContainer"]';
const PLAYER_ID = /^xgwrapper-\d+-(\d{8,})$/;
const ITEM_LINK = /\/(?:video|photo)\/(\d{8,})/;


function idFromPlayer(scope) {
  const players = [...scope.querySelectorAll('[id^="xgwrapper-"]')];
  const ids = [...new Set(players.map(p => p.id.match(PLAYER_ID)?.[1]).filter(Boolean))];
  return ids.length === 1 ? ids[0] : null;
}

function usernameIn(scope) {
  const link = scope.querySelector('[data-e2e="video-author-uniqueid"], a[href^="/@"]');
  const fromHref = link?.getAttribute('href')?.match(/^\/@([^/?#]+)/)?.[1];
  return fromHref ? decodeURIComponent(fromHref) : (link?.textContent.trim() || '');
}

function resolveItem(anchor) {
  const route = parseRoute();
  const scope = anchor.closest(ITEM_SCOPES);

  if (scope) {
    const id = idFromPlayer(scope) ||
      scope.querySelector('a[href*="/video/"], a[href*="/photo/"]')?.getAttribute('href').match(ITEM_LINK)?.[1];
    if (id) return { id, username: usernameIn(scope) };

    const keys = [...scope.querySelectorAll('img[src], video[poster]')].map(el => mediaKey(el.src || el.poster));
    const item = findItemByMediaKeys(keys);
    if (item) return { id: item.id, username: item.username };
  }

  if (route.type === 'item') return { id: route.itemId, username: route.username };

  let el = anchor.parentElement;
  for (let depth = 0; el && el !== document.body && depth < 12; depth++, el = el.parentElement) {
    const players = el.querySelectorAll('[id^="xgwrapper-"]');
    if (players.length > 1) break;
    const id = players.length === 1 ? idFromPlayer(el) : null;
    if (id) return { id, username: usernameIn(el) };
  }
  return null;
}


export function itemMenuItems(item) {
  const isPhoto = item.type === 'photo';
  const count = item.images.length;

  return [
    isPhoto ? null : {
      icon: 'download',
      label: t('MENU_VIDEO'),
      hint: item.quality ? `${item.quality}p` : null,
      onSelect: () => runDownload(() => downloadVideo(item))
    },
    isPhoto ? {
      icon: 'download',
      label: t('MENU_PHOTOS'),
      hint: String(count),
      onSelect: () => runDownloadPhotos(item)
    } : null,
    isPhoto ? {
      icon: 'images',
      label: t('MENU_PHOTO_VIEW'),
      onSelect: () => openImageViewer({
        title: `@${item.username}`,
        subtitle: item.desc,
        load: () => ({ images: item.images }),
        actions: [{ icon: 'download', label: t('DOWNLOAD'), onClick: (index) => runDownload(() => downloadPhoto(item, index)) }]
      })
    } : null,
    {
      icon: 'image',
      label: t('MENU_THUMB'),
      onSelect: () => runDownload(() => downloadThumbnail(item), { thumbnail: true })
    }
  ];
}

async function menuItems(anchor) {
  const target = resolveItem(anchor);
  if (!target) return [{ type: 'message', label: t('ITEM_NOT_FOUND'), error: true }];
  logger.info('Publication', target.id, target.username);
  return itemMenuItems(await fetchItem(target.id, target.username));
}


function findActionBar(likeIcon) {
  let el = likeIcon.parentElement;
  for (let depth = 0; el && el !== document.body && depth < 8; depth++, el = el.parentElement) {
    if (el.querySelector(SIBLING_ICONS)) return el;
  }
  return null;
}

function directChild(parent, node) {
  let el = node;
  while (el && el.parentElement !== parent) el = el.parentElement;
  return el;
}

function inject() {
  document.querySelectorAll(LIKE_ICONS).forEach(like => {
    const bar = findActionBar(like);
    if (!bar || bar.querySelector(':scope > .ttp-dl-btn')) return;

    const after = directChild(bar, bar.querySelector(SHARE_ICONS) || like);
    if (!after) return;

    const vertical = getComputedStyle(bar).flexDirection.startsWith('column');
    const button = featureButton(FEATURE, {
      className: ['ttp-dl-btn', vertical ? 'ttp-dl-btn--vertical' : 'ttp-dl-btn--inline'],
      iconName: 'download',
      label: t('DL_BTN'),
      size: vertical ? 22 : 20,
      stroke: 2.4,
      onClick: (anchor) => {
        openMenu(anchor, () => menuItems(anchor), { placement: vertical ? 'top' : 'bottom' });
      }
    });

    after.insertAdjacentElement('afterend', button);
  });
}

export const videosFeature = {
  name: FEATURE,
  routes: '*',
  enter() {},
  scan: inject,
  leave() {
    removeInjected(FEATURE);
  }
};
