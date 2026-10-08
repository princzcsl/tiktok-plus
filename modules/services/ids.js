import { store } from '../core/storage.js';
import { sleep } from '../core/dom.js';
import { logger } from '../core/logger.js';
import { fetchUser, fetchUserBySecUid } from '../api/tiktok.js';

const KEY = 'marks';

export async function getMarks() {
  return store.get(KEY, {});
}

export function onMarksChange(callback) {
  return store.onChange(KEY, callback);
}

export async function isMarked(id) {
  return Boolean((await getMarks())[id]);
}

export function parseLookupQuery(raw) {
  const query = String(raw || '').trim();
  if (!query) return null;
  if (/^\d{5,}$/.test(query)) return { id: query };
  if (/^MS4wLjABAAAA[\w-]+$/.test(query)) return { secUid: query };

  const fromUrl = query.match(/tiktok\.com\/@([\w.]+)/);
  const username = (fromUrl ? fromUrl[1] : query).replace(/^@/, '');
  return /^[\w.]{1,24}$/.test(username) ? { username } : null;
}

export async function lookup(raw, knownSecUid = async () => null) {
  const parsed = parseLookupQuery(raw);
  if (!parsed) throw new Error('invalid_query');
  if (parsed.username) return fetchUser(parsed.username);

  const secUid = parsed.secUid || (await getMarks())[parsed.id]?.secUid || await knownSecUid(parsed.id);
  if (!secUid) throw new Error('unknown_id');
  const user = await fetchUserBySecUid(secUid);
  if (!user) throw new Error('not_found');
  return user;
}

export async function mark(user) {
  const marks = await getMarks();
  const existing = marks[user.id];
  marks[user.id] = {
    id: user.id,
    secUid: user.secUid || existing?.secUid || '',
    username: user.username,
    markedAs: existing?.markedAs ?? existing?.username ?? user.username,
    nickname: user.nickname || '',
    pic: user.avatarThumb || existing?.pic || '',
    addedAt: existing?.addedAt ?? Date.now(),
    checkedAt: Date.now(),
    changedAt: existing?.changedAt ?? null,
    status: 'ok',
    history: existing?.history ?? []
  };
  await store.set(KEY, marks);
  return marks[user.id];
}

export async function unmark(id) {
  const marks = await getMarks();
  delete marks[id];
  await store.set(KEY, marks);
}

function applyUser(record, user) {
  if (user.username && record.username && user.username !== record.username) {
    record.history = [...(record.history || []), { username: record.username, until: Date.now() }];
    record.changedAt = Date.now();
    record.username = user.username;
  }
  record.nickname = user.nickname ?? record.nickname;
  record.pic = user.avatarThumb || record.pic;
  record.secUid = user.secUid || record.secUid;
  record.status = 'ok';
  record.checkedAt = Date.now();
  return record;
}

export async function refreshMarks(onProgress = () => {}) {
  const marks = await getMarks();
  const ids = Object.keys(marks);
  const renamed = [];

  for (const [index, id] of ids.entries()) {
    const record = marks[id];
    try {
      const user = record.secUid ? await fetchUserBySecUid(record.secUid) : await fetchUser(record.username);
      if (!user) {
        record.status = 'gone';
        record.checkedAt = Date.now();
      } else {
        const before = record.username;
        applyUser(record, user);
        if (record.username !== before) renamed.push({ from: before, to: record.username });
      }
    } catch (error) {
      logger.warning(`Vérification ID ${id} impossible`, error);
    }
    onProgress(index + 1, ids.length);
    if (index < ids.length - 1) await sleep(700);
  }

  await store.set(KEY, marks);
  return renamed;
}

export async function observeUsers(users) {
  const marks = await getMarks();
  const renamed = [];

  for (const user of users) {
    const record = marks[user.id];
    if (!record) continue;
    const before = record.username;
    applyUser(record, user);
    if (record.username !== before) renamed.push({ from: before, to: record.username });
  }

  if (users.some(u => marks[u.id])) await store.set(KEY, marks);
  return renamed;
}
