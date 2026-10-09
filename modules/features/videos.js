import { h, mediaKey } from '../core/dom.js';
import { t, formatDate, formatDuration } from '../core/i18n.js';
import { logger } from '../core/logger.js';
import { parseRoute } from '../core/router.js';
import { cachedSettings } from '../core/storage.js';
import { fetchItem } from '../api/tiktok.js';
import { findItemByMediaKeys } from '../api/pageData.js';
import { timeFromId } from '../api/normalize.js';
import {
  downloadVideo, downloadThumbnail, downloadPhoto, downloadAudio, downloadCanvas, videoVariant
} from '../services/downloads.js';
import { openMenu } from '../ui/menu.js';
import { runDownload, runDownloadPhotos } from '../ui/actions.js';
import { openImageViewer } from '../ui/imageViewer.js';
import { featureButton, removeInjected } from './common.js';
import { speedButton, openSpeedMenu, currentSpeedLabel } from './speed.js';

const FEATURE = 'videos';

const LIKE_ICONS = '[data-e2e="like-icon"], [data-e2e="browse-like-icon"], [data-e2e="video-player-like-icon"]';
const SIBLING_ICONS = '[data-e2e="share-icon"], [data-e2e="browse-share-icon"], [data-e2e="comment-icon"], [data-e2e="browse-comment-icon"]';
const SHARE_ICONS = '[data-e2e="share-icon"], [data-e2e="browse-share-icon"]';
const DESCRIPTIONS = '[data-e2e="video-desc"], [data-e2e="browse-video-desc"]';
const FEED_ITEMS = 'article, [data-e2e="recommend-list-item-container"]';
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

export function resolveItem(anchor) {
  const route = parseRoute();
  const scope = anchor.closest(ITEM_SCOPES);

  if (scope) {
    const id = idFromPlayer(scope) ||
      scope.querySelector('a[href*="/video/"], a[href*="/photo/"]')?.getAttribute('href').match(ITEM_LINK)?.[1];
    if (id) return { id, username: usernameIn(scope), scope };

    const keys = [...scope.querySelectorAll('img[src], video[poster]')].map(el => mediaKey(el.src || el.poster));
    const item = findItemByMediaKeys(keys);
    if (item) return { id: item.id, username: item.username, scope };
  }

  if (route.type === 'item') return { id: route.itemId, username: route.username, scope: null };

  let el = anchor.parentElement;
  for (let depth = 0; el && el !== document.body && depth < 12; depth++, el = el.parentElement) {
    const players = el.querySelectorAll('[id^="xgwrapper-"]');
    if (players.length > 1) break;
    const id = players.length === 1 ? idFromPlayer(el) : null;
    if (id) return { id, username: usernameIn(el), scope: el };
  }
  return null;
}

export function currentTarget() {
  const route = parseRoute();
  if (route.type === 'item') {
    return { id: route.itemId, username: route.username, scope: null };
  }

  const middle = innerHeight / 2;
  let best = null;
  for (const el of document.querySelectorAll(FEED_ITEMS)) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) continue;
    const distance = Math.abs(rect.top + rect.height / 2 - middle);
    if (!best || distance < best.distance) best = { el, distance };
  }
  return best ? resolveItem(best.el) : null;
}

function findVideoElement(scope) {
  const videos = [...(scope || document).querySelectorAll('video')]
    .filter(v => v.videoWidth && !v.closest('.ttp-root'))
    .map(v => ({ v, area: v.getBoundingClientRect().width * v.getBoundingClientRect().height }))
    .filter(x => x.area > 0)
    .sort((a, b) => b.area - a.area);
  return videos[0]?.v || null;
}


function grabFrame(video) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0);
  try {
    context.getImageData(0, 0, 1, 1);
  } catch {
    throw new Error('capture_tainted');
  }
  return canvas;
}

export function captureItem(item, scope) {
  const video = findVideoElement(scope);
  if (!video) throw new Error('capture_no_video');
  const canvas = grabFrame(video);
  return runDownload(() => downloadCanvas(canvas, item));
}


function visibleArea(el, stop) {
  let { left, top, right, bottom } = el.getBoundingClientRect();
  for (let parent = el.parentElement; parent && parent !== stop?.parentElement; parent = parent.parentElement) {
    if (getComputedStyle(parent).overflow === 'visible') continue;
    const r = parent.getBoundingClientRect();
    left = Math.max(left, r.left); top = Math.max(top, r.top);
    right = Math.min(right, r.right); bottom = Math.min(bottom, r.bottom);
  }
  left = Math.max(left, 0); top = Math.max(top, 0);
  right = Math.min(right, innerWidth); bottom = Math.min(bottom, innerHeight);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

export function currentPhotoIndex(item, scope) {
  if (item.type !== 'photo' || item.images.length < 2) return item.type === 'photo' ? 0 : null;
  const keys = item.images.map(img => new Set(img.urls.map(mediaKey).filter(Boolean)));

  let best = null;
  for (const img of (scope || document).querySelectorAll('img[src]')) {
    if (img.closest('.ttp-root')) continue;
    const key = mediaKey(img.currentSrc || img.src);
    const index = key ? keys.findIndex(set => set.has(key)) : -1;
    if (index < 0) continue;
    const area = visibleArea(img, scope);
    if (area > 0 && (!best || area > best.area)) best = { index, area };
  }
  return best ? best.index : null;
}

export function itemMenuItems(item, { scope = null, withCapture = true, anchor = null } = {}) {
  const isPhoto = item.type === 'photo';
  const count = item.images.length;
  const variant = videoVariant(item);
  const slide = isPhoto && count > 1 && withCapture ? currentPhotoIndex(item, scope) : null;
  const meta = [formatDate(item.createTime), !isPhoto && item.duration ? formatDuration(item.duration) : null, isPhoto ? t('N_PHOTOS', { n: count }) : null]
    .filter(Boolean).join(' · ');

  return [
    { type: 'header', label: `@${item.username}`, sublabel: meta },
    isPhoto ? null : {
      icon: 'download',
      label: t('MENU_VIDEO'),
      hint: variant.quality ? `${variant.quality}p` : null,
      onSelect: () => runDownload(() => downloadVideo(item))
    },
    isPhoto && count === 1 ? {
      icon: 'download',
      label: t('MENU_PHOTO'),
      onSelect: () => runDownload(() => downloadPhoto(item, 0))
    } : null,
    slide !== null ? {
      icon: 'download',
      label: t('MENU_PHOTO_CURRENT'),
      hint: `${slide + 1}/${count}`,
      onSelect: () => runDownload(() => downloadPhoto(item, slide))
    } : null,
    isPhoto && count > 1 ? {
      icon: slide !== null ? 'downloadAll' : 'download',
      label: t('MENU_PHOTOS'),
      hint: String(count),
      onSelect: () => runDownloadPhotos(item)
    } : null,
    isPhoto && count > 1 ? {
      icon: 'images',
      label: t('MENU_PHOTO_PICK'),
      onSelect: () => openImageViewer({
        title: `@${item.username}`,
        subtitle: item.desc,
        startIndex: slide ?? 0,
        load: () => ({ images: item.images }),
        actions: [{ icon: 'download', label: t('MENU_PHOTO_THIS'), onClick: (index) => runDownload(() => downloadPhoto(item, index)) }]
      })
    } : null,
    {
      icon: 'image',
      label: t('MENU_THUMB'),
      onSelect: () => runDownload(() => downloadThumbnail(item), { thumbnail: true })
    },
    item.audio.urls.length ? {
      icon: 'music',
      label: t('MENU_AUDIO'),
      hint: 'MP3',
      onSelect: () => runDownload(() => downloadAudio(item))
    } : null,
    !isPhoto && withCapture ? {
      icon: 'camera',
      label: t('MENU_CAPTURE'),
      onSelect: () => captureItem(item, scope)
    } : null,
    !isPhoto && anchor ? { type: 'separator' } : null,
    !isPhoto && anchor ? {
      icon: 'speed',
      label: t('SPEED'),
      hint: currentSpeedLabel(),
      onSelect: () => openSpeedMenu(anchor, anchor.closest('.ttp-dl-btn--vertical, .ttp-story-dl') ? 'top' : 'bottom')
    } : null
  ];
}

async function menuItems(anchor) {
  const target = resolveItem(anchor);
  if (!target) return [{ type: 'message', label: t('ITEM_NOT_FOUND'), error: true }];
  logger.info('Post', target.id, target.username);
  return itemMenuItems(await fetchItem(target.id, target.username), { scope: target.scope, anchor });
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

function downloadButton(layout, placement, size) {
  return featureButton(FEATURE, {
    className: ['ttp-dl-btn', layout],
    iconName: 'download',
    label: t('DL_BTN'),
    size,
    stroke: 2.4,
    onClick: (anchor) => {
      openMenu(anchor, () => menuItems(anchor), { placement, minWidth: 240 });
    }
  });
}

function injectButtons() {
  const { showSpeedButton } = cachedSettings();

  document.querySelectorAll(LIKE_ICONS).forEach(like => {
    const bar = findActionBar(like);
    if (!bar) return;

    const vertical = getComputedStyle(bar).flexDirection.startsWith('column');
    const layout = vertical ? 'ttp-dl-btn--vertical' : 'ttp-dl-btn--inline';
    let download = bar.querySelector(':scope > .ttp-dl-btn');

    if (!download) {
      const after = directChild(bar, bar.querySelector(SHARE_ICONS) || like);
      if (!after) return;
      download = downloadButton(layout, vertical ? 'top' : 'bottom', vertical ? 22 : 20);
      after.insertAdjacentElement('afterend', download);
    }

    const speed = bar.querySelector(':scope > .ttp-speed-btn');
    const wantSpeed = showSpeedButton && !vertical;
    if (wantSpeed && !speed) download.insertAdjacentElement('afterend', speedButton(FEATURE, layout, vertical));
    else if (!wantSpeed && speed) speed.remove();
  });
}

function injectDates() {
  if (!cachedSettings().showDate) {
    document.querySelectorAll('.ttp-date').forEach(el => el.remove());
    return;
  }

  document.querySelectorAll(DESCRIPTIONS).forEach(desc => {
    const target = resolveItem(desc);
    const seconds = target ? timeFromId(target.id) : 0;
    let chip = desc.nextElementSibling?.classList.contains('ttp-date') ? desc.nextElementSibling : null;

    if (!seconds) return chip?.remove();
    if (chip?.dataset.id === target.id) return;

    const label = formatDate(seconds);
    if (!chip) {
      chip = h('div', { class: 'ttp-date', dataset: { ttpFeature: FEATURE } });
      desc.insertAdjacentElement('afterend', chip);
    }
    chip.dataset.id = target.id;
    chip.title = t('PUBLISHED_AT', { date: label });
    chip.textContent = `🗓 ${label}`;
  });
}

export const videosFeature = {
  name: FEATURE,
  routes: '*',
  enter() {},
  scan() {
    injectButtons();
    injectDates();
  },
  leave() {
    removeInjected(FEATURE);
  }
};
