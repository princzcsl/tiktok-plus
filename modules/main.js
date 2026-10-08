import { logger } from './core/logger.js';
import { watchTheme } from './core/theme.js';
import { parseRoute, watchUrl } from './core/router.js';
import { isExtensionAlive } from './core/runtime.js';
import { initPageData } from './api/pageData.js';
import { closeMenuIfDetached } from './ui/menu.js';
import { videosFeature } from './features/videos.js';
import { profileFeature } from './features/profile.js';

const SCAN_THROTTLE = 250;
const FEATURES = [videosFeature, profileFeature];

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
  logger.warning('Contexte d\'extension invalidé, instance désactivée');
}

function boot() {
  watchTheme();
  applyRoute();

  observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });

  watchUrl(() => applyRoute());
  logger.success('Extension chargée');
}

export async function start() {
  initPageData();

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
}
