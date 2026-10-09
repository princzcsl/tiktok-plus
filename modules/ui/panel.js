import { h, clear, copyText } from '../core/dom.js';
import { t, timeAgo, formatDate, errorMessage } from '../core/i18n.js';
import { getSettings, updateSettings, DEFAULT_SETTINGS } from '../core/storage.js';
import { getViewer } from '../api/tiktok.js';
import {
  getSyncMeta, getEvents, markEventsSeen, startManualSync, manualSyncAvailableAt, onSyncProgress,
  isSyncRunning, findSecUid, AUTO_SYNC_INTERVAL
} from '../services/sync.js';
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
  followed: { label: 'EVT_FOLLOWED', className: 'ttp-chip--green' },
  unfollowed: { label: 'EVT_UNFOLLOWED', className: 'ttp-chip--red' },
  gone: { label: 'EVT_GONE', className: 'ttp-chip--muted' },
  rename: { label: 'EVT_RENAME', className: 'ttp-chip--purple' }
};

const FILTERS = [
  { id: 'all', label: 'FILTER_ALL', types: null },
  { id: 'added', label: 'FILTER_ADDED', types: ['followed'] },
  { id: 'removed', label: 'FILTER_REMOVED', types: ['unfollowed', 'gone'] },
  { id: 'renamed', label: 'FILTER_RENAMED', types: ['rename'] }
];

const profileLink = (username, ...children) => h('a', { class: 'ttp-user-link', href: `https://www.tiktok.com/@${encodeURIComponent(username)}` }, ...children);

function avatar(src) {
  return h('span', { class: 'ttp-avatar' }, src ? h('img', { src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null);
}

function eventRow(event) {
  if (event.type === 'baseline') {
    return h('div', { class: 'ttp-event ttp-event--baseline' },
      icon('flag', { size: 16 }),
      h('span', {}, t('EVT_BASELINE', { n: event.count })),
      h('span', { class: 'ttp-event-time' }, new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
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
    h('span', { class: 'ttp-event-time' }, new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
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
  const filters = h('div', { class: 'ttp-chips' });
  const list = h('div', { class: 'ttp-events' });
  let filter = 'all';
  let events = [];

  async function renderSummary() {
    const [meta, availableAt] = await Promise.all([getSyncMeta(viewer.id), manualSyncAvailableAt(viewer.id)]);
    const running = isSyncRunning();
    const button = h('button', {
      class: 'ttp-button ttp-primary',
      type: 'button',
      disabled: running || Boolean(availableAt),
      on: { click: async () => { await startManualSync(); refresh(); } }
    }, icon('sync', { size: 16, className: running ? 'ttp-spin' : '' }), t(running ? 'SYNC_RUNNING' : 'SYNC_NOW'));

    clear(summary,
      h('div', { class: 'ttp-card-main' },
        h('div', {},
          h('div', { class: 'ttp-card-title' }, `@${viewer.username || meta?.username || ''}`),
          h('div', { class: 'ttp-muted' }, meta
            ? t('SYNC_SUMMARY', { n: meta.count, ago: timeAgo(meta.at / 1000) })
            : t('SYNC_NEVER'))
        ),
        button
      ),
      h('div', { class: 'ttp-help ttp-muted' },
        availableAt ? t('SYNC_NEXT_MANUAL', { time: new Date(availableAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : null,
        availableAt ? ' · ' : null,
        (await getSettings()).autoSync
          ? (meta ? t('SYNC_NEXT_AUTO', { date: formatDate((meta.at + AUTO_SYNC_INTERVAL) / 1000) }) : t('SYNC_AUTO_SOON'))
          : t('SYNC_AUTO_OFF')
      )
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
    renderList();
  }

  clear(body, summary, h('div', { class: 'ttp-section-title' }, t('HISTORY')), filters, list);
  await refresh();
  await markEventsSeen(viewer.id);
  cleanups.push(onSyncProgress((state) => {
    if (!state) refresh();
    else {
      const label = summary.querySelector('.ttp-muted');
      if (label) label.textContent = t('SYNC_PROGRESS', { count: state.count, expected: state.expected ?? '?' });
    }
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

    h('div', { class: 'ttp-section-title' }, t('PANEL_FOLLOWING')),
    field(t('SET_AUTO_SYNC'), t('SET_AUTO_SYNC_HELP'), toggle(settings.autoSync, v => save({ autoSync: v })))
  );
}
