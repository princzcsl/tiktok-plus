import { cachedSettings } from '../core/storage.js';
import { logger } from '../core/logger.js';
import { fetchItem } from '../api/tiktok.js';
import { downloadVideo, downloadAudio } from '../services/downloads.js';
import { runDownload, runDownloadPhotos } from '../ui/actions.js';
import { hasOpenOverlay } from '../ui/overlay.js';
import { toast } from '../ui/toast.js';
import { currentTarget, captureItem } from './videos.js';

function isTyping(target) {
  return target instanceof Element && (target.matches('input, textarea, select') || target.isContentEditable || Boolean(target.closest('[contenteditable="true"]')));
}

async function run(action) {
  const target = currentTarget();
  if (!target) return;
  const item = await fetchItem(target.id, target.username);

  if (action === 'download') {
    if (item.type === 'photo') return runDownloadPhotos(item);
    return runDownload(() => downloadVideo(item));
  }
  if (action === 'audio') return runDownload(() => downloadAudio(item));
  if (action === 'capture' && item.type === 'video') return captureItem(item, target.scope);
}

function onKey(e) {
  const settings = cachedSettings();
  if (!settings.shortcuts || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (isTyping(e.target) || hasOpenOverlay()) return;

  const key = e.key.toLowerCase();
  const action = Object.entries(settings.keys).find(([, value]) => value && value.toLowerCase() === key)?.[0];
  if (!action) return;

  e.preventDefault();
  e.stopPropagation();
  run(action).catch(error => {
    logger.error('Raccourci', error);
    toast.error(error);
  });
}

export function initShortcuts() {
  window.addEventListener('keydown', onKey, true);
}
