import { logger } from './core/logger.js';
import { t } from './core/i18n.js';
import { watchTheme } from './core/theme.js';
import { getSettings, store } from './core/storage.js';
import { parseRoute, watchUrl } from './core/router.js';
import { isExtensionAlive } from './core/runtime.js';
import { initPageData, onPageUsers } from './api/pageData.js';
import { getMarks, observeUsers } from './services/ids.js';
import { startSyncScheduler } from './services/sync.js';
import { closeMenuIfDetached } from './ui/menu.js';
import { openPanel } from './ui/panel.js';
import { toast } from './ui/toast.js';
import { videosFeature } from './features/videos.js';
import { tilesFeature } from './features/tiles.js';
import { profileFeature } from './features/profile.js';
import { storiesFeature } from './features/stories.js';
import { initSpeed } from './features/speed.js';
import { initShortcuts } from './features/shortcuts.js';

const SCAN_THROTTLE = 250;
const FEATURES = [videosFeature, storiesFeature, tilesFeature, profileFeature];

const active = new Map();
let observer = null;
let scanTimer = null;
let currentPageType = null;

function applyRoute() {
  const route = parseRoute();

  if (route.type !== currentPageType) {
    logger.pageChange(currentPageType, route.type);
    currentPageType = route.type;
  }

  for (const feature of FEATURES) {
    const matches = feature.routes === '*' || feature.routes.includes(route.type);

    if (!matches) {
      if (active.has(feature)) {
        feature.leave();
        active.delete(feature);
      }
      continue;
    }

    const key = feature.key ? feature.key(route) : route.type;
    if (!active.has(feature) || active.get(feature) !== key) {
      feature.enter(route);
      active.set(feature, key);
    }
  }

  scheduleScan();
}

function scheduleScan() {
  if (scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    runScan();
  }, SCAN_THROTTLE);
}

function runScan() {
  if (!isExtensionAlive()) {
    shutdown();
    return;
  }

  closeMenuIfDetached();

  const route = parseRoute();
  for (const feature of active.keys()) {
    try {
      feature.scan(route);
    } catch (error) {
      logger.error(`[${feature.name}] scan`, error);
    }
  }
}

function shutdown() {
  observer?.disconnect();
  observer = null;
  document.querySelectorAll('[data-ttp-feature], .ttp-root').forEach(el => el.remove());
  logger.warning('Extension context invalidated, instance disabled');
}

function boot() {
  watchTheme();
  initSpeed();
  initShortcuts();
  applyRoute();

  observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });

  watchUrl(() => applyRoute());

  store.onChange('settings', scheduleScan);

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'openPanel') {
      openPanel({ tab: request.tab || 'following' });
      sendResponse({ ok: true });
    }
  });

  startSyncScheduler();
  watchMarkedRenames();
  logger.success('Extension loaded');
}

function watchMarkedRenames() {
  const pending = new Map();
  let timer = null;

  const flush = async () => {
    const batch = [...pending.values()];
    pending.clear();
    const marks = await getMarks();
    const relevant = batch.filter(user => marks[user.id]);
    if (!relevant.length) return;
    const renamed = await observeUsers(relevant);
    renamed.forEach(r => toast(t('MARK_RENAMED_TOAST', { from: r.from, to: r.to }), { duration: 6000 }));
  };

  onPageUsers((users) => {
    users.forEach(u => pending.set(u.id, u));
    clearTimeout(timer);
    timer = setTimeout(() => flush().catch(() => {}), 1500);
  });
}

export async function start() {
  initPageData();
  await getSettings();

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
}
