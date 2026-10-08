import { logger } from '../core/logger.js';
import { findRaw } from './normalize.js';
import { ingest, getItem, getUserByName, getStoryItems, itemHasMedia } from './pageData.js';

const REQUEST_TIMEOUT = 15000;


let sequence = 0;
const pending = new Map();

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== 'ttp-hook' || !event.data.reply) return;
  const resolve = pending.get(event.data.reply);
  if (!resolve) return;
  pending.delete(event.data.reply);
  resolve(event.data);
});

function pageRequest(path, params = {}) {
  return new Promise((resolve, reject) => {
    const id = `ttp_${Date.now()}_${++sequence}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('timeout'));
    }, REQUEST_TIMEOUT);

    pending.set(id, (response) => {
      clearTimeout(timer);
      if (response.error) return reject(new Error(response.error));
      if (response.status >= 400) return reject(new Error(`http_${response.status}`));
      if (!response.text) return reject(new Error('empty_response'));
      try {
        resolve(JSON.parse(response.text));
      } catch {
        reject(new Error('bad_response'));
      }
    });

    window.postMessage({ source: 'ttp-content', action: 'request', id, path, params }, location.origin);
  });
}

async function fetchUniversalData(path) {
  const response = await fetch(path, { credentials: 'include' });
  if (!response.ok) throw new Error(`http_${response.status}`);
  const html = await response.text();
  const match = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('not_found');
  return JSON.parse(match[1])?.__DEFAULT_SCOPE__ || {};
}

function remember(root, { story = false } = {}) {
  const { items, users } = findRaw(root);
  ingest({ items, users, story });
  return items;
}


export async function fetchItem(id, username = '') {
  const cached = getItem(id);
  if (cached && itemHasMedia(cached)) return cached;

  try {
    const data = await pageRequest('/api/item/detail/', { itemId: id });
    remember(data?.itemInfo || data);
    const item = getItem(id);
    if (item && itemHasMedia(item)) return item;
  } catch (error) {
    logger.warning('item/detail indisponible, repli sur la page HTML', error.message);
  }

  const scope = await fetchUniversalData(`/@${encodeURIComponent(username || 'tiktok')}/video/${id}`);
  remember(scope['webapp.video-detail'] || scope);
  const item = getItem(id);
  if (item && itemHasMedia(item)) return item;
  throw new Error('not_found');
}


export async function fetchUser(username) {
  const cached = getUserByName(username);
  if (cached?.hasHD) return cached;

  try {
    const data = await pageRequest('/api/user/detail/', { uniqueId: username, secUid: cached?.secUid || '' });
    remember(data?.userInfo || data);
    const user = getUserByName(username);
    if (user?.hasHD) return user;
  } catch (error) {
    logger.warning('user/detail indisponible, repli sur la page HTML', error.message);
  }

  try {
    const scope = await fetchUniversalData(`/@${encodeURIComponent(username)}`);
    remember(scope['webapp.user-detail'] || scope);
  } catch (error) {
    if (!cached) throw error;
  }

  const user = getUserByName(username) || cached;
  if (!user) throw new Error('not_found');
  return user;
}


export async function fetchStories(user) {
  const found = new Map(getStoryItems(user.id).map(item => [item.id, item]));
  const belongsToUser = (item) => !item.authorId || item.authorId === user.id ||
    item.username.toLowerCase() === user.username.toLowerCase();

  const attempts = [
    ['/api/story/item_list/', { authorId: user.id, cursor: 0, count: 30, loadBackward: false }],
    ['/api/story/batch/item_list/', { authorIds: JSON.stringify([user.id]) }]
  ];

  let lastError = null;
  let answered = false;
  for (const [path, params] of attempts) {
    try {
      const data = await pageRequest(path, params);
      answered = true;
      const raws = remember(data, { story: true });
      raws.map(raw => getItem(raw.id)).filter(item => item && belongsToUser(item)).forEach(item => found.set(item.id, item));
      if (found.size) break;
    } catch (error) {
      lastError = error;
      logger.warning(`${path} indisponible`, error.message);
    }
  }

  if (!found.size && !answered && lastError) throw lastError;
  return [...found.values()].sort((a, b) => a.createTime - b.createTime);
}
