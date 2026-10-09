import { store, getSettings } from '../core/storage.js';
import { sleep } from '../core/dom.js';
import { logger } from '../core/logger.js';
import { t } from '../core/i18n.js';
import { sendBackground } from '../core/runtime.js';
import { getViewer, fetchFollowingPage, fetchUserBySecUid } from '../api/tiktok.js';
import { observeUsers } from './ids.js';
import { toast } from '../ui/toast.js';

export const AUTO_SYNC_INTERVAL = 24 * 3600 * 1000;
export const MANUAL_SYNC_COOLDOWN = 3600 * 1000;
const CHECK_INTERVAL = 10 * 60 * 1000;
const LOCK_TTL = 15 * 60 * 1000;
const RATE_LIMIT_COOLDOWN = 2 * 3600 * 1000;
const PAGE_DELAY = [1500, 3000];
const MAX_FOLLOWING = 5000;
const MAX_EVENTS = 3000;
const VERIFY_LOST_MAX = 10;

const LOCK_KEY = 'syncLock';
const COOLDOWN_KEY = 'syncCooldownUntil';
const OWNER = Math.random().toString(36).slice(2);

const keys = (vid) => ({ snap: `snap:${vid}`, meta: `meta:${vid}`, events: `events:${vid}`, seen: `seen:${vid}` });

export class SyncError extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    Object.assign(this, extra);
  }
}

const packUser = (user) => [user.username, user.nickname || '', user.avatarThumb || '', user.secUid || ''];
const unpackUser = (id, packed) => {
  const [username, nickname, pic, secUid] = packed || ['', '', '', ''];
  return { id, username, nickname, avatarThumb: pic, secUid };
};


export async function getSnapshot(vid) {
  const raw = vid ? await store.get(keys(vid).snap) : null;
  if (!raw) return null;
  return { ...raw, list: raw.following.map(id => unpackUser(id, raw.users[id])) };
}

export async function getSyncMeta(vid) {
  return vid ? store.get(keys(vid).meta) : null;
}

export async function getEvents(vid) {
  return vid ? store.get(keys(vid).events, []) : [];
}

const NOTABLE = ['followed', 'unfollowed', 'gone', 'rename'];

export async function getUnseenCount(vid) {
  if (!vid) return 0;
  const [events, seen] = await Promise.all([getEvents(vid), store.get(keys(vid).seen, 0)]);
  return events.filter(e => e.at > seen && NOTABLE.includes(e.type)).length;
}

export async function markEventsSeen(vid) {
  if (!vid) return;
  await store.set(keys(vid).seen, Date.now());
  await updateBadge(vid);
}

export async function updateBadge(vid) {
  try {
    await sendBackground({ action: 'setBadge', count: await getUnseenCount(vid) });
  } catch {}
}

export async function findSecUid(id) {
  const viewer = await getViewer().catch(() => null);
  const raw = viewer ? await store.get(keys(viewer.id).snap) : null;
  return raw?.users?.[id]?.[3] || null;
}

export async function manualSyncAvailableAt(vid) {
  const last = (await getSyncMeta(vid))?.at;
  return last && Date.now() - last < MANUAL_SYNC_COOLDOWN ? last + MANUAL_SYNC_COOLDOWN : 0;
}


async function acquireLock() {
  const lock = await store.get(LOCK_KEY);
  if (lock && lock.owner !== OWNER && Date.now() - lock.at < LOCK_TTL) return false;
  await store.set(LOCK_KEY, { owner: OWNER, at: Date.now() });
  await sleep(80);
  return (await store.get(LOCK_KEY))?.owner === OWNER;
}

const touchLock = () => store.set(LOCK_KEY, { owner: OWNER, at: Date.now() });

async function releaseLock() {
  if ((await store.get(LOCK_KEY))?.owner === OWNER) await store.remove(LOCK_KEY);
}


const listeners = new Set();
let running = null;
let progressState = null;

export function onSyncProgress(callback) {
  listeners.add(callback);
  callback(progressState);
  return () => listeners.delete(callback);
}

function emit(state) {
  progressState = state;
  listeners.forEach(cb => cb(state));
}

export const isSyncRunning = () => Boolean(running);

const randomDelay = () => PAGE_DELAY[0] + Math.random() * (PAGE_DELAY[1] - PAGE_DELAY[0]);

async function fetchFollowing(viewer, onProgress) {
  const users = new Map();
  let cursor = 0;
  let total = null;

  for (let page = 0; page < 400; page++) {
    let result;
    try {
      result = await fetchFollowingPage(viewer.secUid, cursor);
    } catch (error) {
      if (/http_429/.test(error.message)) throw new SyncError('rate_limited');
      throw error;
    }
    total ??= result.total;
    result.users.forEach(u => users.set(u.id, u));
    onProgress(users.size, total);
    if (users.size > MAX_FOLLOWING) throw new SyncError('too_large');
    if (!result.hasMore || !result.users.length || String(result.cursor) === String(cursor)) break;
    cursor = result.cursor;
    touchLock();
    await sleep(randomDelay());
  }
  return { users: [...users.values()], total };
}

async function verifyLost(events) {
  for (const event of events.filter(e => e.type === 'unfollowed' && e.s).slice(0, VERIFY_LOST_MAX)) {
    try {
      if (!(await fetchUserBySecUid(event.s))) event.type = 'gone';
    } catch {}
    await sleep(800);
  }
}

export function runSync({ manual = true, silent = false } = {}) {
  if (!running) {
    running = doSync({ manual, silent }).finally(() => {
      running = null;
      emit(null);
    });
  }
  return running;
}

export async function startManualSync() {
  try {
    return await runSync({ manual: true });
  } catch (error) {
    if (['sync_busy', 'sync_cooldown', 'login_required'].includes(error.code)) toast.error(syncErrorMessage(error));
    return null;
  }
}

export function syncErrorMessage(error) {
  const messages = {
    sync_busy: t('SYNC_BUSY'),
    sync_cooldown: t('SYNC_COOLDOWN', { time: new Date(error.retryAt || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }),
    login_required: t('SYNC_LOGIN'),
    rate_limited: t('SYNC_RATE_LIMITED'),
    too_large: t('SYNC_TOO_LARGE', { max: MAX_FOLLOWING }),
    incomplete: t('SYNC_INCOMPLETE')
  };
  return messages[error.code] || error;
}

async function doSync({ manual, silent }) {
  const viewer = await getViewer().catch(() => null);
  if (!viewer?.secUid) throw new SyncError('login_required');
  const vid = viewer.id;

  if (manual) {
    const availableAt = await manualSyncAvailableAt(vid);
    if (availableAt) throw new SyncError('sync_cooldown', { retryAt: availableAt });
  }
  if (!(await acquireLock())) throw new SyncError('sync_busy');

  const k = keys(vid);
  const progress = silent ? null : toast.progress(t('SYNC_STARTING'));

  try {
    const prev = await store.get(k.snap);
    const { users, total } = await fetchFollowing(viewer, (count, expected) => {
      emit({ count, expected });
      progress?.update(t('SYNC_PROGRESS', { count, expected: expected ?? '?' }), expected ? count / expected : null);
    });

    const reference = total || prev?.following?.length || 0;
    if (reference > 20 && users.length < reference * 0.6) throw new SyncError('incomplete');

    const at = Date.now();
    const events = [];
    const event = (type, user, extra = {}) => ({ type, id: user.id, u: user.username, n: user.nickname, p: user.avatarThumb, s: user.secUid, at, ...extra });

    if (prev) {
      const before = new Set(prev.following);
      const now = new Set(users.map(u => u.id));
      events.push(...users.filter(u => !before.has(u.id)).map(u => event('followed', u)));
      events.push(...prev.following.filter(id => !now.has(id)).map(id => event('unfollowed', unpackUser(id, prev.users[id]))));
      events.push(...users
        .filter(u => prev.users[u.id]?.[0] && prev.users[u.id][0] !== u.username)
        .map(u => event('rename', u, { from: prev.users[u.id][0], to: u.username })));
    } else {
      events.push({ type: 'baseline', count: users.length, at });
    }

    if (events.some(e => e.type === 'unfollowed')) {
      progress?.update(t('SYNC_VERIFYING'));
      await verifyLost(events);
    }

    await store.set(k.snap, { users: Object.fromEntries(users.map(u => [u.id, packUser(u)])), following: users.map(u => u.id), at });
    await store.set(k.meta, { at, username: viewer.username, count: users.length });
    if (events.length) await store.set(k.events, [...events, ...await store.get(k.events, [])].slice(0, MAX_EVENTS));

    await observeUsers(users);
    await updateBadge(vid);

    const added = events.filter(e => e.type === 'followed').length;
    const removed = events.filter(e => e.type === 'unfollowed' || e.type === 'gone').length;
    const renamed = events.filter(e => e.type === 'rename').length;
    const summary = prev ? t('SYNC_DONE', { added, removed, renamed }) : t('SYNC_FIRST_DONE', { count: users.length });

    if (progress) progress.done(summary);
    else if (added || removed || renamed) toast.success(`TikTok+ · ${summary}`, { duration: 6000 });

    logger.success('Sync complete', { count: users.length, events: events.length });
    return { events, count: users.length };
  } catch (error) {
    logger.error('Sync', error);
    if (error.code === 'rate_limited') await store.set(COOLDOWN_KEY, Date.now() + RATE_LIMIT_COOLDOWN);
    progress?.fail(syncErrorMessage(error));
    throw error;
  } finally {
    await releaseLock();
  }
}


export function startSyncScheduler() {
  const tick = async () => {
    try {
      if (!(await getSettings()).autoSync || running) return;
      if (Date.now() < (await store.get(COOLDOWN_KEY, 0))) return;
      const viewer = await getViewer().catch(() => null);
      if (!viewer) return;

      const meta = await getSyncMeta(viewer.id);
      if (meta && Date.now() - meta.at < AUTO_SYNC_INTERVAL) return;

      logger.info('Automatic following sync');
      await runSync({ manual: false, silent: true });
    } catch (error) {
      if (error.code !== 'sync_busy') logger.warning('Automatic sync failed', error);
    }
  };

  setTimeout(tick, 30 * 1000);
  setInterval(tick, CHECK_INTERVAL);
  getViewer().then(viewer => viewer && updateBadge(viewer.id)).catch(() => {});
}
