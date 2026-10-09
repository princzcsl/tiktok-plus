import { store, getSettings, cachedSettings } from '../core/storage.js';
import { sleep } from '../core/dom.js';
import { logger } from '../core/logger.js';
import { t } from '../core/i18n.js';
import { sendBackground } from '../core/runtime.js';
import { getViewer, fetchUserListPage, fetchUserBySecUid } from '../api/tiktok.js';
import { observeUsers } from './ids.js';
import { toast } from '../ui/toast.js';

export const LISTS = ['followers', 'following'];
export const SYNC_INTERVALS = { off: 0, '12h': 12 * 3600 * 1000, '24h': 24 * 3600 * 1000 };
export const MANUAL_SYNC_COOLDOWN = 3600 * 1000;
const PACES = { slow: [1500, 3000], normal: [800, 1600] };
const CHECK_INTERVAL = 10 * 60 * 1000;
const LOCK_TTL = 15 * 60 * 1000;
const RATE_LIMIT_COOLDOWN = 2 * 3600 * 1000;
export const MAX_LIST_SIZE = 5000;
const MAX_EVENTS = 3000;
const VERIFY_LOST_MAX = 10;

const LOCK_KEY = 'syncLock';
const COOLDOWN_KEY = 'syncCooldownUntil';
const OWNER = Math.random().toString(36).slice(2);

const keys = (vid) => ({ snap: `snap:${vid}`, meta: `meta:${vid}`, events: `events:${vid}`, seen: `seen:${vid}` });

const EVENT_TYPES = {
  followers: { added: 'follow', removed: 'unfollow' },
  following: { added: 'followed', removed: 'unfollowed' }
};

export const NOTABLE_EVENTS = ['follow', 'unfollow', 'followed', 'unfollowed', 'gone', 'rename'];

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

export function listsFromSetting(value = cachedSettings().syncLists) {
  return value === 'followers' || value === 'following' ? [value] : [...LISTS];
}

function readSnap(raw) {
  if (!raw) return { users: {}, followers: null, following: null, followersAt: null, followingAt: null };
  return {
    users: raw.users || {},
    followers: raw.followers ?? null,
    following: raw.following ?? null,
    followersAt: raw.followersAt ?? null,
    followingAt: raw.followingAt ?? (raw.following ? raw.at ?? null : null)
  };
}

function readMeta(raw) {
  if (!raw) return null;
  return {
    username: raw.username || '',
    followersAt: raw.followersAt ?? null,
    followingAt: raw.followingAt ?? raw.at ?? null,
    followerCount: raw.followerCount ?? null,
    followingCount: raw.followingCount ?? raw.count ?? null
  };
}

export async function getSnapshot(vid) {
  if (!vid) return null;
  const snap = readSnap(await store.get(keys(vid).snap));
  const hydrate = (ids) => ids?.map(id => unpackUser(id, snap.users[id])) ?? null;
  return { ...snap, followerList: hydrate(snap.followers), followingList: hydrate(snap.following) };
}

export async function getSyncMeta(vid) {
  return vid ? readMeta(await store.get(keys(vid).meta)) : null;
}

export async function getEvents(vid) {
  const events = vid ? await store.get(keys(vid).events, []) : [];
  return events.map(e => (e.list || !['baseline', 'followed', 'unfollowed'].includes(e.type) ? e : { ...e, list: 'following' }));
}

export function relationsOf(snapshot) {
  if (!snapshot?.followers || !snapshot?.following) return null;
  const followers = new Set(snapshot.followers);
  const following = new Set(snapshot.following);
  return {
    notFollowingBack: snapshot.followingList.filter(u => !followers.has(u.id)),
    fans: snapshot.followerList.filter(u => !following.has(u.id))
  };
}

export async function getUnseenCount(vid) {
  if (!vid) return 0;
  const [events, seen] = await Promise.all([getEvents(vid), store.get(keys(vid).seen, 0)]);
  return events.filter(e => e.at > seen && NOTABLE_EVENTS.includes(e.type)).length;
}

export async function markEventsSeen(vid) {
  if (!vid) return;
  await store.set(keys(vid).seen, Date.now());
  await updateBadge(vid);
}

export async function updateBadge(vid) {
  try {
    const count = (await getSettings()).showBadge ? await getUnseenCount(vid) : 0;
    await sendBackground({ action: 'setBadge', count });
  } catch {}
}

export async function clearTrackingData(vid) {
  const k = keys(vid);
  await Promise.all([store.remove(k.snap), store.remove(k.meta), store.remove(k.events), store.remove(k.seen)]);
  await updateBadge(vid);
}

export async function findSecUid(id) {
  const viewer = await getViewer().catch(() => null);
  const raw = viewer ? await store.get(keys(viewer.id).snap) : null;
  return raw?.users?.[id]?.[3] || null;
}

export async function manualSyncAvailableAt(vid, listType) {
  const last = (await getSyncMeta(vid))?.[`${listType}At`];
  return last && Date.now() - last < MANUAL_SYNC_COOLDOWN ? last + MANUAL_SYNC_COOLDOWN : 0;
}

export function nextAutoSyncAt(meta, listType, interval = SYNC_INTERVALS[cachedSettings().syncInterval]) {
  if (!interval) return null;
  const last = meta?.[`${listType}At`];
  return last ? last + interval : Date.now();
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

function randomDelay() {
  const [min, max] = PACES[cachedSettings().syncPace] || PACES.slow;
  return min + Math.random() * (max - min);
}

async function fetchList(viewer, listType, onProgress) {
  const users = new Map();
  let cursor = 0;
  let total = null;

  for (let page = 0; page < 400; page++) {
    let result;
    try {
      result = await fetchUserListPage(viewer.secUid, listType, cursor);
    } catch (error) {
      if (/http_429/.test(error.message)) throw new SyncError('rate_limited');
      throw error;
    }
    total ??= result.total;
    if (total > MAX_LIST_SIZE) throw new SyncError('too_large', { listType });
    result.users.forEach(u => users.set(u.id, u));
    onProgress(users.size, total);
    if (users.size > MAX_LIST_SIZE) throw new SyncError('too_large', { listType });
    if (!result.hasMore || !result.users.length || String(result.cursor) === String(cursor)) break;
    cursor = result.cursor;
    touchLock();
    await sleep(randomDelay());
  }
  return { users: [...users.values()], total };
}

async function verifyLost(events) {
  const lost = events.filter(e => (e.type === 'unfollowed' || e.type === 'unfollow') && e.s);
  const checked = new Map();
  for (const event of lost.slice(0, VERIFY_LOST_MAX * 2)) {
    if (!checked.has(event.id)) {
      if (checked.size >= VERIFY_LOST_MAX) break;
      let gone = false;
      try {
        gone = !(await fetchUserBySecUid(event.s));
      } catch {}
      checked.set(event.id, gone);
      await sleep(800);
    }
    if (checked.get(event.id)) event.type = 'gone';
  }

  const seenGone = new Set();
  return events.filter(e => {
    if (e.type !== 'gone') return true;
    if (seenGone.has(e.id)) return false;
    seenGone.add(e.id);
    return true;
  });
}

export function runSync({ lists = listsFromSetting(), manual = true, silent = false } = {}) {
  if (!running) {
    running = doSync({ lists, manual, silent }).finally(() => {
      running = null;
      emit(null);
    });
  }
  return running;
}

export async function startManualSync(lists = listsFromSetting()) {
  try {
    return await runSync({ lists, manual: true });
  } catch (error) {
    if (['sync_busy', 'sync_cooldown', 'login_required'].includes(error.code)) toast.error(syncErrorMessage(error));
    return null;
  }
}

export function syncErrorMessage(error) {
  const listName = error.listType ? t(error.listType === 'followers' ? 'LIST_FOLLOWERS' : 'LIST_FOLLOWING').toLowerCase() : '';
  const messages = {
    sync_busy: t('SYNC_BUSY'),
    sync_cooldown: t('SYNC_COOLDOWN', { time: new Date(error.retryAt || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }),
    login_required: t('SYNC_LOGIN'),
    rate_limited: t('SYNC_RATE_LIMITED'),
    too_large: t('SYNC_TOO_LARGE', { max: MAX_LIST_SIZE, list: listName }),
    incomplete: t('SYNC_INCOMPLETE', { list: listName })
  };
  return messages[error.code] || error;
}

function diffList(listType, prevIds, users, prevUsers, at) {
  const types = EVENT_TYPES[listType];
  const event = (type, user) => ({ type, list: listType, id: user.id, u: user.username, n: user.nickname, p: user.avatarThumb, s: user.secUid, at });
  const before = new Set(prevIds);
  const now = new Set(users.map(u => u.id));
  return [
    ...users.filter(u => !before.has(u.id)).map(u => event(types.added, u)),
    ...prevIds.filter(id => !now.has(id)).map(id => event(types.removed, unpackUser(id, prevUsers[id])))
  ];
}

function diffRenames(users, prevUsers, at) {
  return users
    .filter(u => prevUsers[u.id]?.[0] && u.username && prevUsers[u.id][0] !== u.username)
    .map(u => ({ type: 'rename', id: u.id, u: u.username, n: u.nickname, p: u.avatarThumb, s: u.secUid, at, from: prevUsers[u.id][0], to: u.username }));
}

async function doSync({ lists, manual, silent }) {
  const viewer = await getViewer().catch(() => null);
  if (!viewer?.secUid) throw new SyncError('login_required');
  const vid = viewer.id;

  let targets = lists;
  if (manual) {
    const waits = await Promise.all(lists.map(listType => manualSyncAvailableAt(vid, listType)));
    targets = lists.filter((_, i) => !waits[i]);
    if (!targets.length) throw new SyncError('sync_cooldown', { retryAt: Math.min(...waits) });
  }
  if (!(await acquireLock())) throw new SyncError('sync_busy');

  const k = keys(vid);
  const progress = silent ? null : toast.progress(t('SYNC_STARTING'));

  try {
    const prev = readSnap(await store.get(k.snap));
    const prevMeta = readMeta(await store.get(k.meta)) || {};
    const fetched = {};
    const failures = [];

    for (const listType of targets) {
      const label = t(listType === 'followers' ? 'LIST_FOLLOWERS' : 'LIST_FOLLOWING');
      try {
        const { users, total } = await fetchList(viewer, listType, (count, expected) => {
          emit({ listType, count, expected });
          progress?.update(t('SYNC_PROGRESS', { list: label, count, expected: expected ?? '?' }), expected ? count / expected : null);
        });
        const reference = total || prev[listType]?.length || 0;
        if (reference > 20 && users.length < reference * 0.6) throw new SyncError('incomplete', { listType });
        fetched[listType] = users;
      } catch (error) {
        if (error.code === 'rate_limited') throw error;
        logger.warning(`Sync of ${listType} failed`, error);
        failures.push(error);
      }
    }

    const synced = Object.keys(fetched);
    if (!synced.length) throw failures[0] || new SyncError('incomplete');

    const at = Date.now();
    let events = [];
    for (const listType of synced) {
      if (prev[listType]) events.push(...diffList(listType, prev[listType], fetched[listType], prev.users, at));
      else events.push({ type: 'baseline', list: listType, count: fetched[listType].length, at });
    }
    const unique = new Map(synced.flatMap(listType => fetched[listType]).map(u => [u.id, u]));
    events.push(...diffRenames([...unique.values()], prev.users, at));

    if (events.some(e => e.type === 'unfollowed' || e.type === 'unfollow')) {
      progress?.update(t('SYNC_VERIFYING'));
      events = await verifyLost(events);
    }

    const next = { ...prev, users: { ...prev.users } };
    for (const listType of synced) {
      next[listType] = fetched[listType].map(u => u.id);
      next[`${listType}At`] = at;
    }
    for (const user of unique.values()) next.users[user.id] = packUser(user);
    const keep = new Set([...(next.followers || []), ...(next.following || [])]);
    for (const id of Object.keys(next.users)) if (!keep.has(id)) delete next.users[id];

    await store.set(k.snap, next);
    await store.set(k.meta, {
      username: viewer.username || prevMeta.username || '',
      followersAt: next.followersAt,
      followingAt: next.followingAt,
      followerCount: next.followers?.length ?? null,
      followingCount: next.following?.length ?? null
    });
    if (events.length) await store.set(k.events, [...events, ...await store.get(k.events, [])].slice(0, MAX_EVENTS));

    await observeUsers([...unique.values()]);
    await updateBadge(vid);

    const count = (...types) => events.filter(e => types.includes(e.type)).length;
    const parts = [];
    if (fetched.followers) {
      parts.push(prev.followers
        ? t('SYNC_DONE_FOLLOWERS', { added: count('follow'), removed: count('unfollow') })
        : t('SYNC_FIRST_FOLLOWERS', { count: fetched.followers.length }));
    }
    if (fetched.following) {
      parts.push(prev.following
        ? t('SYNC_DONE_FOLLOWING', { added: count('followed'), removed: count('unfollowed') })
        : t('SYNC_FIRST_FOLLOWING', { count: fetched.following.length }));
    }
    if (count('gone')) parts.push(t('SYNC_DONE_GONE', { n: count('gone') }));
    if (count('rename')) parts.push(t('SYNC_DONE_RENAMED', { n: count('rename') }));
    const summary = parts.join(' · ');

    if (failures.length) {
      const message = `${summary} · ${syncErrorMessage(failures[0])}`;
      if (progress) progress.fail(message);
      else logger.warning(message);
    } else if (progress) {
      progress.done(summary);
    } else if (cachedSettings().syncNotify && events.some(e => NOTABLE_EVENTS.includes(e.type))) {
      toast.success(`TikTok+ · ${summary}`, { duration: 6000 });
    }

    logger.success('Sync complete', { lists: synced, events: events.length });
    return { events, lists: synced, failures };
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
      const settings = await getSettings();
      const interval = SYNC_INTERVALS[settings.syncInterval];
      if (!interval || running) return;
      if (Date.now() < (await store.get(COOLDOWN_KEY, 0))) return;
      const viewer = await getViewer().catch(() => null);
      if (!viewer) return;

      const meta = await getSyncMeta(viewer.id);
      const due = listsFromSetting(settings.syncLists).filter(listType => {
        const last = meta?.[`${listType}At`];
        return !last || Date.now() - last >= interval;
      });
      if (!due.length) return;

      logger.info('Automatic sync', due);
      await runSync({ lists: due, manual: false, silent: true });
    } catch (error) {
      if (error.code !== 'sync_busy') logger.warning('Automatic sync failed', error);
    }
  };

  setTimeout(tick, 30 * 1000);
  setInterval(tick, CHECK_INTERVAL);
  getViewer().then(viewer => viewer && updateBadge(viewer.id)).catch(() => {});
}
