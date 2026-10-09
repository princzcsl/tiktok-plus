import { h, clear, copyText } from '../core/dom.js';
import { t, timeAgo, formatDate, errorMessage } from '../core/i18n.js';
import { getSettings, updateSettings, cachedSettings, DEFAULT_SETTINGS } from '../core/storage.js';
import { getViewer } from '../api/tiktok.js';
import {
  getSyncMeta, getEvents, getSnapshot, markEventsSeen, startManualSync, manualSyncAvailableAt, onSyncProgress,
  isSyncRunning, findSecUid, listsFromSetting, nextAutoSyncAt, relationsOf, clearTrackingData, updateBadge, SYNC_INTERVALS
} from '../services/sync.js';
import { isPickerSupported, saveBlobWithPicker } from '../services/save.js';
import { runDownload } from './actions.js';
import { getMarks, onMarksChange, lookup, mark, unmark, refreshMarks, isMarked } from '../services/ids.js';
import { icon } from './icons.js';
import { openOverlay } from './overlay.js';
import { toast } from './toast.js';
import { SPEEDS, speedLabel } from '../features/speed.js';

const TABS = [
  { id: 'following', label: 'PANEL_FOLLOWING', icon: 'users' },
  { id: 'ids', label: 'PANEL_IDS', icon: 'fingerprint' },
  { id: 'settings', label: 'PANEL_SETTINGS', icon: 'settings' }
];

let current = null;

export function openPanel({ tab = 'following' } = {}) {
  if (current) {
    current.show(tab);
    return current;
  }

  const cleanups = [];
  const { root, close } = openOverlay({
    className: 'ttp-panel',
    onClose: () => {
      cleanups.forEach(fn => fn());
      current = null;
    }
  });

  const body = h('div', { class: 'ttp-sheet-body' });
  const tabButtons = TABS.map(def => h('button', {
    class: 'ttp-tab',
    type: 'button',
    dataset: { tab: def.id },
    on: { click: () => show(def.id) }
  }, icon(def.icon, { size: 16 }), t(def.label)));

  const sheet = h('div', { class: 'ttp-sheet ttp-glass' },
    h('div', { class: 'ttp-sheet-header' },
      h('div', { class: 'ttp-sheet-title' }, h('strong', {}, 'TikTok+'), h('span', { class: 'ttp-muted' }, `v${chrome.runtime.getManifest().version}`)),
      h('button', { class: 'ttp-tool', type: 'button', title: t('CLOSE'), on: { click: close } }, icon('close', { size: 18 }))
    ),
    h('div', { class: 'ttp-tabs' }, tabButtons),
    body
  );
  root.append(sheet);

  function show(id) {
    cleanups.splice(0).forEach(fn => fn());
    tabButtons.forEach(button => button.classList.toggle('ttp-on', button.dataset.tab === id));
    clear(body, h('div', { class: 'ttp-empty' }, h('span', { class: 'ttp-spinner' })));
    const render = { following: renderFollowing, ids: renderIds, settings: renderSettings }[id] || renderFollowing;
    render(body, cleanups).catch(error => clear(body, h('div', { class: 'ttp-empty ttp-error' }, errorMessage(error))));
  }

  show(tab);
  current = { show, close };
  return current;
}


const EVENT_LABELS = {
  follow: { label: 'EVT_FOLLOW', className: 'ttp-chip--green' },
  unfollow: { label: 'EVT_UNFOLLOW', className: 'ttp-chip--red' },
  followed: { label: 'EVT_FOLLOWED', className: 'ttp-chip--cyan' },
  unfollowed: { label: 'EVT_UNFOLLOWED', className: 'ttp-chip--orange' },
  gone: { label: 'EVT_GONE', className: 'ttp-chip--muted' },
  rename: { label: 'EVT_RENAME', className: 'ttp-chip--purple' }
};

const FILTERS = [
  { id: 'all', label: 'FILTER_ALL', types: null },
  { id: 'follow', label: 'FILTER_NEW_FOLLOWERS', types: ['follow'] },
  { id: 'unfollow', label: 'FILTER_LOST_FOLLOWERS', types: ['unfollow'] },
  { id: 'followed', label: 'FILTER_FOLLOWED', types: ['followed'] },
  { id: 'unfollowed', label: 'FILTER_UNFOLLOWED', types: ['unfollowed'] },
  { id: 'gone', label: 'FILTER_GONE', types: ['gone'] },
  { id: 'renamed', label: 'FILTER_RENAMED', types: ['rename'] }
];

const listLabel = (listType) => t(listType === 'followers' ? 'LIST_FOLLOWERS' : 'LIST_FOLLOWING');
const timeOf = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

async function exportCsv(users, name) {
  const rows = [['id', 'username', 'nickname', 'profile'], ...users.map(u => [u.id, u.username, u.nickname, `https://www.tiktok.com/@${u.username}`])];
  const csv = `﻿${rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const filename = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
  if (cachedSettings().saveMode !== 'downloads' && isPickerSupported()) return saveBlobWithPicker(async () => blob, filename);
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: filename, style: 'display:none' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return filename;
}

const profileLink = (username, ...children) => h('a', { class: 'ttp-user-link', href: `https://www.tiktok.com/@${encodeURIComponent(username)}` }, ...children);

function avatar(src) {
  return h('span', { class: 'ttp-avatar' }, src ? h('img', { src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null);
}

function userRow(user) {
  return h('div', { class: 'ttp-event' },
    avatar(user.avatarThumb),
    h('div', { class: 'ttp-event-text' },
      profileLink(user.username, h('strong', {}, `@${user.username}`)),
      user.nickname ? h('span', { class: 'ttp-muted' }, user.nickname) : null
    )
  );
}

function eventRow(event) {
  if (event.type === 'baseline') {
    return h('div', { class: 'ttp-event ttp-event--baseline' },
      icon('flag', { size: 16 }),
      h('span', {}, t(event.list === 'followers' ? 'EVT_BASELINE_FOLLOWERS' : 'EVT_BASELINE', { n: event.count })),
      h('span', { class: 'ttp-event-time' }, timeOf(event.at))
    );
  }
  const def = EVENT_LABELS[event.type];
  return h('div', { class: 'ttp-event' },
    avatar(event.p),
    h('div', { class: 'ttp-event-text' },
      profileLink(event.u, h('strong', {}, `@${event.u}`)),
      event.type === 'rename' ? h('span', { class: 'ttp-muted' }, t('EVT_RENAME_DETAIL', { from: event.from, to: event.to })) : (event.n ? h('span', { class: 'ttp-muted' }, event.n) : null)
    ),
    h('span', { class: ['ttp-chip', def?.className] }, t(def?.label || 'EVT_UNKNOWN')),
    h('span', { class: 'ttp-event-time' }, timeOf(event.at))
  );
}

function dayLabel(at) {
  const day = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (day.toDateString() === today.toDateString()) return t('TODAY');
  if (day.toDateString() === yesterday.toDateString()) return t('YESTERDAY');
  return day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function renderFollowing(body, cleanups) {
  const viewer = await getViewer().catch(() => null);
  if (!viewer) {
    clear(body, h('div', { class: 'ttp-empty' }, t('SYNC_LOGIN')));
    return;
  }

  const summary = h('div', { class: 'ttp-card' });
  const relations = h('div', { class: 'ttp-relations' });
  const filters = h('div', { class: 'ttp-chips' });
  const list = h('div', { class: 'ttp-events' });
  let filter = 'all';
  let events = [];
  let openRelation = null;

  function listLine(listType, meta, availableAt, settings) {
    const last = meta?.[`${listType}At`];
    const total = meta?.[listType === 'followers' ? 'followerCount' : 'followingCount'];
    const next = nextAutoSyncAt(meta, listType, SYNC_INTERVALS[settings.syncInterval]);
    const details = [
      last ? t('SYNC_LIST_DONE', { n: total ?? 0, ago: timeAgo(last / 1000) }) : t('SYNC_NEVER'),
      availableAt ? t('SYNC_NEXT_MANUAL', { time: timeOf(availableAt) }) : null,
      next ? t('SYNC_NEXT_AUTO', { date: next <= Date.now() ? t('SYNC_SOON') : formatDate(next / 1000) }) : t('SYNC_AUTO_OFF')
    ].filter(Boolean).join(' · ');
    return h('div', { class: 'ttp-sync-line' }, h('strong', {}, listLabel(listType)), h('span', { class: 'ttp-muted' }, details));
  }

  async function renderSummary() {
    const settings = await getSettings();
    const enabled = listsFromSetting(settings.syncLists);
    const meta = await getSyncMeta(viewer.id);
    const waits = await Promise.all(enabled.map(listType => manualSyncAvailableAt(viewer.id, listType)));
    const running = isSyncRunning();
    const button = h('button', {
      class: 'ttp-button ttp-primary',
      type: 'button',
      disabled: running || waits.every(Boolean),
      on: { click: async () => { await startManualSync(enabled); refresh(); } }
    }, icon('sync', { size: 16, className: running ? 'ttp-spin' : '' }), t(running ? 'SYNC_RUNNING' : 'SYNC_NOW'));

    clear(summary,
      h('div', { class: 'ttp-card-main' },
        h('div', { class: 'ttp-card-title' }, `@${viewer.username || meta?.username || ''}`),
        button
      ),
      h('div', { class: 'ttp-sync-lines' }, enabled.map((listType, i) => listLine(listType, meta, waits[i], settings))),
      h('div', { class: 'ttp-progress-line ttp-muted' })
    );
  }

  async function renderRelations() {
    const snapshot = await getSnapshot(viewer.id);
    const lists = [
      snapshot?.followerList ? { id: 'followers', users: snapshot.followerList } : null,
      snapshot?.followingList ? { id: 'following', users: snapshot.followingList } : null
    ].filter(Boolean);
    if (!lists.length) {
      clear(relations);
      return;
    }

    const rel = relationsOf(snapshot);
    const groups = [
      rel ? { id: 'notFollowingBack', label: t('REL_NOT_FOLLOWING_BACK'), help: t('REL_NOT_FOLLOWING_BACK_HELP'), users: rel.notFollowingBack } : null,
      rel ? { id: 'fans', label: t('REL_FANS'), help: t('REL_FANS_HELP'), users: rel.fans } : null
    ].filter(Boolean);
    const shown = groups.find(group => group.id === openRelation);

    clear(relations,
      h('div', { class: 'ttp-section-title' }, t('RELATIONS')),
      rel ? null : h('p', { class: 'ttp-help ttp-muted' }, t('REL_NEED_BOTH')),
      h('div', { class: 'ttp-chips' },
        groups.map(group => h('button', {
          class: ['ttp-chip-btn', openRelation === group.id && 'ttp-on'],
          type: 'button',
          title: group.help,
          on: { click: () => { openRelation = openRelation === group.id ? null : group.id; renderRelations(); } }
        }, group.label, h('span', { class: 'ttp-muted' }, String(group.users.length)))),
        lists.map(entry => h('button', {
          class: 'ttp-chip-btn',
          type: 'button',
          on: { click: () => runDownload(() => exportCsv(entry.users, `tiktok_${entry.id}`)) }
        }, icon('download', { size: 14 }), t('EXPORT_CSV', { list: listLabel(entry.id).toLowerCase() })))
      ),
      shown ? h('div', { class: 'ttp-events ttp-relation-list' },
        h('div', { class: 'ttp-row ttp-space ttp-help ttp-muted' },
          h('span', {}, shown.help),
          shown.users.length ? h('button', { class: 'ttp-chip-btn', type: 'button', on: { click: () => runDownload(() => exportCsv(shown.users, `tiktok_${shown.id}`)) } }, icon('download', { size: 14 }), 'CSV') : null
        ),
        shown.users.length ? shown.users.slice(0, 500).map(userRow) : h('div', { class: 'ttp-empty' }, t('REL_EMPTY'))
      ) : null
    );
  }

  function renderList() {
    const types = FILTERS.find(f => f.id === filter)?.types;
    const visible = events.filter(e => !types || types.includes(e.type));
    clear(filters, FILTERS.map(f => h('button', {
      class: ['ttp-chip-btn', f.id === filter && 'ttp-on'],
      type: 'button',
      on: { click: () => { filter = f.id; renderList(); } }
    }, t(f.label), h('span', { class: 'ttp-muted' }, String(events.filter(e => !f.types || f.types.includes(e.type)).length)))));

    if (!visible.length) {
      clear(list, h('div', { class: 'ttp-empty' }, events.length ? t('HISTORY_EMPTY_FILTER') : t('HISTORY_EMPTY')));
      return;
    }

    const groups = [];
    for (const event of visible.slice(0, 500)) {
      const label = dayLabel(event.at);
      if (groups[groups.length - 1]?.label !== label) groups.push({ label, events: [] });
      groups[groups.length - 1].events.push(event);
    }
    clear(list, groups.map(group => [h('div', { class: 'ttp-day' }, group.label), group.events.map(eventRow)]));
  }

  async function refresh() {
    events = await getEvents(viewer.id);
    await renderSummary();
    await renderRelations();
    renderList();
  }

  clear(body, summary, relations, h('div', { class: 'ttp-section-title' }, t('HISTORY')), filters, list);
  await refresh();
  await markEventsSeen(viewer.id);
  cleanups.push(onSyncProgress((state) => {
    if (!state) {
      refresh();
      return;
    }
    const line = summary.querySelector('.ttp-progress-line');
    if (line) line.textContent = t('SYNC_PROGRESS', { list: listLabel(state.listType), count: state.count, expected: state.expected ?? '?' });
  }));
}


function userCard(user, marked) {
  const markButton = h('button', {
    class: 'ttp-button',
    type: 'button',
    on: {
      click: async () => {
        if (await isMarked(user.id)) await unmark(user.id);
        else await mark(user);
        const now = await isMarked(user.id);
        markButton.replaceChildren(icon(now ? 'starFilled' : 'star', { size: 16 }), t(now ? 'UNMARK' : 'MARK_ID'));
      }
    }
  }, icon(marked ? 'starFilled' : 'star', { size: 16 }), t(marked ? 'UNMARK' : 'MARK_ID'));

  return h('div', { class: 'ttp-card ttp-card-main' },
    avatar(user.avatarThumb),
    h('div', { class: 'ttp-event-text' },
      profileLink(user.username, h('strong', {}, `@${user.username}`)),
      h('span', { class: 'ttp-muted' }, user.nickname),
      h('span', { class: 'ttp-mono' }, `ID ${user.id}`)
    ),
    h('button', { class: 'ttp-button', type: 'button', on: { click: async () => { await copyText(user.id); toast.success(t('ID_COPIED')); } } }, icon('copy', { size: 16 }), t('COPY')),
    markButton
  );
}

function markRow(record) {
  const renamed = record.markedAs && record.markedAs !== record.username;
  return h('div', { class: ['ttp-event', record.status === 'gone' && 'ttp-gone'] },
    avatar(record.pic),
    h('div', { class: 'ttp-event-text' },
      profileLink(record.username, h('strong', {}, `@${record.username}`)),
      renamed ? h('span', { class: 'ttp-muted' }, t('MARKED_AS', { name: record.markedAs })) : null,
      record.history?.length ? h('span', { class: 'ttp-muted' }, t('FORMER_NAMES', { names: record.history.map(entry => `@${entry.username}`).join(', ') })) : null,
      h('span', { class: 'ttp-mono' }, `ID ${record.id}`)
    ),
    record.status === 'gone' ? h('span', { class: 'ttp-chip ttp-chip--muted' }, t('EVT_GONE')) : null,
    record.changedAt ? h('span', { class: 'ttp-chip ttp-chip--purple', title: formatDate(record.changedAt / 1000) }, t('EVT_RENAME')) : null,
    h('button', { class: 'ttp-tool', type: 'button', title: t('COPY_ID'), on: { click: async () => { await copyText(record.id); toast.success(t('ID_COPIED')); } } }, icon('copy', { size: 16 })),
    h('button', { class: 'ttp-tool', type: 'button', title: t('UNMARK'), on: { click: () => unmark(record.id) } }, icon('trash', { size: 16 }))
  );
}

async function renderIds(body, cleanups) {
  const input = h('input', { class: 'ttp-input', type: 'text', placeholder: t('LOOKUP_PLACEHOLDER'), spellcheck: false });
  const result = h('div', { class: 'ttp-lookup-result' });
  const list = h('div', { class: 'ttp-events' });
  const refreshButton = h('button', { class: 'ttp-button', type: 'button', on: { click: refreshAll } }, icon('sync', { size: 16 }), t('MARKS_REFRESH'));

  async function search() {
    const query = input.value.trim();
    if (!query) return;
    clear(result, h('span', { class: 'ttp-spinner' }));
    try {
      const user = await lookup(query, findSecUid);
      clear(result, userCard(user, await isMarked(user.id)));
    } catch (error) {
      clear(result, h('div', { class: 'ttp-error ttp-help' }, errorMessage(error)));
    }
  }

  async function refreshAll() {
    refreshButton.disabled = true;
    const progress = toast.progress(t('MARKS_CHECKING', { done: 0, total: '…' }));
    try {
      const renamed = await refreshMarks((done, total) => progress.update(t('MARKS_CHECKING', { done, total }), done / total));
      progress.done(renamed.length ? t('MARKS_RENAMED', { n: renamed.length }) : t('MARKS_UP_TO_DATE'));
    } catch (error) {
      progress.fail(error);
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function renderList() {
    const marks = Object.values(await getMarks()).sort((a, b) => (b.changedAt || b.addedAt) - (a.changedAt || a.addedAt));
    clear(list, marks.length ? marks.map(markRow) : h('div', { class: 'ttp-empty' }, t('MARKS_EMPTY')));
    refreshButton.disabled = !marks.length;
  }

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });

  clear(body,
    h('div', { class: 'ttp-section-title' }, t('LOOKUP_TITLE')),
    h('div', { class: 'ttp-row' }, input, h('button', { class: 'ttp-button ttp-primary', type: 'button', on: { click: search } }, icon('search', { size: 16 }), t('SEARCH'))),
    h('p', { class: 'ttp-help ttp-muted' }, t('LOOKUP_HELP')),
    result,
    h('div', { class: 'ttp-section-title ttp-row ttp-space' }, h('span', {}, t('MARKS_TITLE')), refreshButton),
    list
  );
  await renderList();
  cleanups.push(onMarksChange(renderList));
}


function field(label, help, control) {
  return h('label', { class: 'ttp-field' },
    h('span', { class: 'ttp-field-text' }, h('span', {}, label), help ? h('span', { class: 'ttp-help ttp-muted' }, help) : null),
    control
  );
}

function select(value, options, onChange) {
  const el = h('select', { class: 'ttp-select', on: { change: () => onChange(el.value) } },
    options.map(([optionValue, label]) => h('option', { value: String(optionValue), selected: String(optionValue) === String(value) }, label)));
  return el;
}

function toggle(checked, onChange) {
  const el = h('input', { class: 'ttp-switch', type: 'checkbox', checked, on: { change: () => onChange(el.checked) } });
  return el;
}

function keyInput(value, onChange) {
  const el = h('input', {
    class: 'ttp-input ttp-key',
    type: 'text',
    maxlength: 1,
    value: value.toUpperCase(),
    on: {
      keydown: (e) => {
        e.preventDefault();
        if (e.key.length !== 1 || !/[a-z0-9]/i.test(e.key)) return;
        el.value = e.key.toUpperCase();
        onChange(e.key.toLowerCase());
      }
    }
  });
  return el;
}

async function renderSettings(body) {
  const settings = await getSettings();
  const save = async (patch) => {
    await updateSettings(patch);
    toast.success(t('SETTINGS_SAVED'), { duration: 1400 });
  };
  const saveKey = (name) => (key) => save({ keys: { ...settings.keys, [name]: key } });

  clear(body,
    h('div', { class: 'ttp-section-title' }, t('SET_DOWNLOADS')),
    field(t('SET_SAVE_MODE'), t('SET_SAVE_MODE_HELP'), select(settings.saveMode, [['ask', t('SET_SAVE_ASK')], ['downloads', t('SET_SAVE_DOWNLOADS')]], v => save({ saveMode: v }))),
    field(t('SET_QUALITY'), t('SET_QUALITY_HELP'), select(settings.quality, [['best', t('SET_QUALITY_BEST')], ['compat', t('SET_QUALITY_COMPAT')]], v => save({ quality: v }))),
    field(t('SET_HOVER'), null, toggle(settings.hoverButton, v => save({ hoverButton: v }))),

    h('div', { class: 'ttp-section-title' }, t('SET_PLAYBACK')),
    field(t('SET_SPEED'), null, select(settings.playbackRate, SPEEDS.map(rate => [rate, speedLabel(rate)]), v => save({ playbackRate: Number(v) }))),
    field(t('SET_SPEED_BUTTON'), null, toggle(settings.showSpeedButton, v => save({ showSpeedButton: v }))),
    field(t('SET_DATE'), t('SET_DATE_HELP'), toggle(settings.showDate, v => save({ showDate: v }))),

    h('div', { class: 'ttp-section-title' }, t('SET_SHORTCUTS')),
    field(t('SET_SHORTCUTS_ON'), t('SET_SHORTCUTS_HELP'), toggle(settings.shortcuts, v => save({ shortcuts: v }))),
    field(t('KEY_DOWNLOAD'), null, keyInput(settings.keys.download || DEFAULT_SETTINGS.keys.download, saveKey('download'))),
    field(t('KEY_AUDIO'), null, keyInput(settings.keys.audio || DEFAULT_SETTINGS.keys.audio, saveKey('audio'))),
    field(t('KEY_CAPTURE'), null, keyInput(settings.keys.capture || DEFAULT_SETTINGS.keys.capture, saveKey('capture'))),

    h('div', { class: 'ttp-section-title' }, t('SET_TRACKING')),
    field(t('SET_SYNC_LISTS'), null, select(settings.syncLists, [['both', t('SET_SYNC_BOTH')], ['followers', t('LIST_FOLLOWERS')], ['following', t('LIST_FOLLOWING')]], v => save({ syncLists: v }))),
    field(t('SET_SYNC_INTERVAL'), t('SET_SYNC_INTERVAL_HELP'), select(settings.syncInterval, [['24h', t('SET_EVERY_24H')], ['12h', t('SET_EVERY_12H')], ['off', t('SET_SYNC_OFF')]], v => save({ syncInterval: v }))),
    field(t('SET_SYNC_PACE'), t('SET_SYNC_PACE_HELP'), select(settings.syncPace, [['slow', t('SET_PACE_SLOW')], ['normal', t('SET_PACE_NORMAL')]], v => save({ syncPace: v }))),
    field(t('SET_SYNC_NOTIFY'), t('SET_SYNC_NOTIFY_HELP'), toggle(settings.syncNotify, v => save({ syncNotify: v }))),
    field(t('SET_BADGE'), null, toggle(settings.showBadge, async v => {
      await save({ showBadge: v });
      const viewer = await getViewer().catch(() => null);
      if (viewer) updateBadge(viewer.id);
    })),
    field(t('SET_CLEAR_TRACKING'), t('SET_CLEAR_TRACKING_HELP'), h('button', {
      class: 'ttp-button',
      type: 'button',
      on: {
        click: async () => {
          const viewer = await getViewer().catch(() => null);
          if (!viewer || !confirm(t('SET_CLEAR_TRACKING_CONFIRM'))) return;
          await clearTrackingData(viewer.id);
          toast.success(t('SET_CLEAR_TRACKING_DONE'));
        }
      }
    }, icon('trash', { size: 16 }), t('CLEAR')))
  );
}
