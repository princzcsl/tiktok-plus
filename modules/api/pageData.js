import { normalizeItem, normalizeUser } from './normalize.js';
import { mediaKey } from '../core/dom.js';

const items = new Map();
const users = new Map();
const usernames = new Map();
const stories = new Map();

const hasMedia = (item) => item.video.best.urls.length > 0 || item.images.length > 0;

let viewer = null;
const userListeners = new Set();

export const getPageViewer = () => viewer;

export function onPageUsers(callback) {
  userListeners.add(callback);
  return () => userListeners.delete(callback);
}

export function ingest(data) {
  if (data.viewer?.id) viewer = data.viewer;
  if (data.users?.length) {
    const seen = data.users.map(normalizeUser).filter(u => u.username);
    userListeners.forEach(cb => cb(seen));
  }

  for (const raw of data.users || []) {
    const user = normalizeUser(raw);
    const previous = users.get(user.id);
    users.set(user.id, previous && previous.hasHD && !user.hasHD ? { ...user, avatarHD: previous.avatarHD, hasHD: true } : { ...previous, ...user });
    if (user.username) usernames.set(user.username.toLowerCase(), user.id);
  }

  for (const raw of data.items || []) {
    const item = normalizeItem(raw);
    const previous = items.get(item.id);
    const merged = previous && hasMedia(previous) && !hasMedia(item) ? previous : item;
    if (data.story || previous?.isStory) merged.isStory = true;
    items.set(item.id, merged);

    if (data.story && merged.authorId) {
      if (!stories.has(merged.authorId)) stories.set(merged.authorId, new Map());
      stories.get(merged.authorId).set(merged.id, merged);
    }
  }
}

export function initPageData() {
  (window.__ttpPageBuffer || []).forEach(ingest);
  window.__ttpPageBuffer = null;

  window.addEventListener('message', (event) => {
    if (event.source === window && event.data?.source === 'ttp-hook' && !event.data.reply) ingest(event.data);
  });
}

export const getItem = (id) => items.get(String(id)) || null;
export const forgetItem = (id) => items.delete(String(id));
export const getUserById = (id) => users.get(String(id)) || null;
export const getUserByName = (username) => getUserById(usernames.get(String(username).toLowerCase())) || null;
export const getStoryItems = (authorId) => [...(stories.get(String(authorId))?.values() || [])];
export const itemHasMedia = hasMedia;

export function findItemByMediaKeys(keys) {
  const wanted = new Set(keys.filter(Boolean));
  if (!wanted.size) return null;
  for (const item of items.values()) {
    const urls = [...item.coverUrls, ...item.images.flatMap(img => img.urls)];
    if (urls.some(url => wanted.has(mediaKey(url)))) return item;
  }
  return null;
}
