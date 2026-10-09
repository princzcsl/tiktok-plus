import { h, stopEvent, sleep } from '../core/dom.js';
import { t, errorMessage } from '../core/i18n.js';
import { logger } from '../core/logger.js';
import { parseRoute } from '../core/router.js';
import { cachedSettings } from '../core/storage.js';
import { fetchItem } from '../api/tiktok.js';
import { openBatch, downloadItem } from '../services/downloads.js';
import { iconSvg, icon } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { itemMenuItems } from './videos.js';

const FEATURE = 'tiles';
const TILE_LINKS = 'a[href*="/video/"], a[href*="/photo/"]';
const LINK = /\/@([^/?#]+)\/(?:video|photo)\/(\d{8,})/;
const BATCH_DELAY = 400;


function findTiles() {
  const tiles = [];
  for (const link of document.querySelectorAll(TILE_LINKS)) {
    const match = link.getAttribute('href')?.match(LINK);
    if (!match || !link.querySelector('img')) continue;
    if (link.closest('article, [data-e2e="recommend-list-item-container"], .ttp-root, [data-e2e="browse-video"]')) continue;
    const box = link.closest('[data-e2e="user-post-item"], [data-e2e$="-item"]') || link.parentElement;
    if (!box) continue;
    tiles.push({ link, box, id: match[2], username: decodeURIComponent(match[1]) });
  }
  return tiles;
}

function ensurePositioned(box) {
  if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
}


function hoverButton() {
  const button = h('div', {
    class: 'ttp-tile-btn',
    role: 'button',
    title: t('DL_BTN'),
    'aria-label': t('DL_BTN'),
    dataset: { ttpFeature: FEATURE },
    html: iconSvg('download', { size: 18, stroke: 2.4 })
  });

  ['pointerdown', 'mousedown', 'mouseup'].forEach(type => button.addEventListener(type, e => e.stopPropagation()));
  button.addEventListener('click', (e) => {
    stopEvent(e);
    const { id, username } = JSON.parse(button.closest('[data-ttp-tile-info]').dataset.ttpTileInfo);
    openMenu(button, async () => itemMenuItems(await fetchItem(id, username), { withCapture: false }), { minWidth: 240 });
  });
  return button;
}


const selection = {
  active: false,
  all: false,
  items: new Map(),
  bar: null
};

function toggleItem(tile, checked = !selection.items.has(tile.id)) {
  if (checked) selection.items.set(tile.id, { id: tile.id, username: tile.username });
  else {
    selection.items.delete(tile.id);
    selection.all = false;
  }
  renderSelection();
}

function checkbox() {
  return h('div', {
    class: 'ttp-tile-check',
    role: 'checkbox',
    dataset: { ttpFeature: FEATURE },
    html: iconSvg('check', { size: 16, stroke: 3 })
  });
}

function onTileClick(e) {
  if (!selection.active) return;
  const box = e.currentTarget;
  stopEvent(e);
  const info = JSON.parse(box.dataset.ttpTileInfo);
  toggleItem(info);
}

function renderSelection() {
  document.querySelectorAll('[data-ttp-tile]').forEach(box => {
    const { id } = JSON.parse(box.dataset.ttpTileInfo);
    box.classList.toggle('ttp-selected', selection.items.has(id));
  });
  if (!selection.bar) return;
  const count = selection.items.size;
  selection.bar.querySelector('.ttp-select-count').textContent = t('N_SELECTED', { n: count });
  selection.bar.querySelector('.ttp-select-all').classList.toggle('ttp-on', selection.all);
  selection.bar.querySelector('.ttp-select-download').disabled = !count;
}

function selectAll() {
  selection.all = !selection.all;
  if (selection.all) findTiles().forEach(tile => selection.items.set(tile.id, { id: tile.id, username: tile.username }));
  else selection.items.clear();
  renderSelection();
}

export function startSelection() {
  if (selection.active) return;
  selection.active = true;
  selection.all = false;
  selection.items.clear();
  document.documentElement.classList.add('ttp-selecting');

  selection.bar = h('div', { class: 'ttp-select-bar ttp-root ttp-glass' },
    h('button', { class: 'ttp-select-all', type: 'button', on: { click: selectAll } },
      h('span', { class: 'ttp-select-box', html: iconSvg('check', { size: 14, stroke: 3 }) }),
      t('SELECT_ALL')
    ),
    h('span', { class: 'ttp-select-count' }),
    h('button', { class: 'ttp-select-download ttp-primary', type: 'button', on: { click: downloadSelection } }, icon('download', { size: 16 }), t('DOWNLOAD')),
    h('button', { class: 'ttp-select-cancel', type: 'button', title: t('CANCEL'), on: { click: stopSelection } }, icon('close', { size: 16 }))
  );
  ['pointerdown', 'mousedown', 'click'].forEach(type => selection.bar.addEventListener(type, e => e.stopPropagation()));
  document.body.append(selection.bar);
  scan();
  renderSelection();
}

export function stopSelection() {
  selection.active = false;
  selection.all = false;
  selection.items.clear();
  selection.bar?.remove();
  selection.bar = null;
  document.documentElement.classList.remove('ttp-selecting');
  renderSelection();
}

export const isSelecting = () => selection.active;

async function downloadSelection() {
  const targets = [...selection.items.values()];
  if (!targets.length) return;

  let dir;
  try {
    dir = await openBatch();
  } catch (error) {
    if (error.name !== 'AbortError') toast.error(error);
    return;
  }

  stopSelection();
  const progress = toast.progress(t('DL_PROGRESS', { done: 0, total: targets.length }));
  let failed = 0;
  let firstError = null;

  for (const [index, target] of targets.entries()) {
    try {
      await downloadItem(await fetchItem(target.id, target.username), dir);
    } catch (error) {
      failed++;
      firstError ??= error;
      logger.warning(`Téléchargement ${target.id} (@${target.username}) impossible : ${error?.message || error}`, error);
    }
    progress.update(t('DL_PROGRESS', { done: index + 1, total: targets.length }), (index + 1) / targets.length);
    if (index < targets.length - 1) await sleep(BATCH_DELAY);
  }

  const done = targets.length - failed;
  const message = dir ? t('DL_ALL_SAVED_AT', { n: done, where: dir.name }) : t('DL_ALL_DONE', { n: done });
  if (failed) progress.fail(`${message} · ${t('N_FAILED', { n: failed })} (${errorMessage(firstError)})`);
  else progress.done(message);
}


function scan() {
  const route = parseRoute();
  const showHover = cachedSettings().hoverButton;
  if (selection.active && route.type !== 'profile') stopSelection();

  for (const tile of findTiles()) {
    const { box } = tile;
    const info = JSON.stringify({ id: tile.id, username: tile.username });

    if (box.dataset.ttpTileInfo !== info) {
      box.dataset.ttpTile = '';
      box.dataset.ttpTileInfo = info;
      if (!box.dataset.ttpTileBound) {
        box.dataset.ttpTileBound = '1';
        box.addEventListener('click', onTileClick, true);
      }
    }

    ensurePositioned(box);
    const button = box.querySelector(':scope > .ttp-tile-btn');
    if (showHover && !button) box.append(hoverButton());
    else if (!showHover && button) button.remove();

    if (selection.active) {
      if (!box.querySelector(':scope > .ttp-tile-check')) box.append(checkbox());
      if (selection.all) selection.items.set(tile.id, { id: tile.id, username: tile.username });
    }
  }

  if (selection.active) renderSelection();
}

export const tilesFeature = {
  name: FEATURE,
  routes: '*',
  enter() {},
  scan,
  leave() {
    stopSelection();
    document.querySelectorAll('.ttp-tile-btn, .ttp-tile-check').forEach(el => el.remove());
  }
};
