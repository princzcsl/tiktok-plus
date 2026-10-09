import { t, errorMessage } from '../core/i18n.js';
import { logger } from '../core/logger.js';
import { downloadAllPhotos, downloadPhoto, downloadItem, openBatch } from '../services/downloads.js';
import { toast } from './toast.js';

const isCancel = (error) => error?.name === 'AbortError';

export async function runDownload(task, { thumbnail = false } = {}) {
  try {
    const saved = await task();
    toast.download(saved ? t('DL_SAVED_AT', { where: saved }) : t(thumbnail ? 'DL_THUMB_STARTED' : 'DL_STARTED'));
  } catch (error) {
    if (isCancel(error)) return;
    logger.error('Download', error);
    toast.error(error);
  }
}

export async function runBatch(loadItems) {
  let dir;
  try {
    dir = await openBatch();
  } catch (error) {
    if (!isCancel(error)) toast.error(error);
    return;
  }

  const progress = toast.progress(t('LOADING'));
  let items;
  try {
    items = await loadItems();
  } catch (error) {
    progress.fail(error);
    return;
  }
  if (!items.length) return progress.fail(t('NO_STORIES'));

  let failed = 0;
  let firstError = null;
  for (const [index, item] of items.entries()) {
    try {
      await downloadItem(item, dir);
    } catch (error) {
      failed++;
      firstError ??= error;
      logger.warning(`Download of ${item.id} failed: ${error?.message || error}`, error);
    }
    progress.update(t('DL_PROGRESS', { done: index + 1, total: items.length }), (index + 1) / items.length);
  }

  const done = items.length - failed;
  const message = dir ? t('DL_ALL_SAVED_AT', { n: done, where: dir.name }) : t('DL_ALL_DONE', { n: done });
  if (failed) progress.fail(`${message} · ${t('N_FAILED', { n: failed })} (${errorMessage(firstError)})`);
  else progress.done(message);
}

export async function runDownloadPhotos(item) {
  const total = item.images.length;
  if (total <= 1) return runDownload(() => downloadPhoto(item, 0));

  let progress = null;
  try {
    const where = await downloadAllPhotos(item, (done) => {
      progress ||= toast.progress(t('DL_PROGRESS', { done: 0, total }));
      progress.update(t('DL_PROGRESS', { done, total }), done / total);
    });
    const message = where ? t('DL_ALL_SAVED_AT', { n: total, where }) : t('DL_ALL_DONE', { n: total });
    if (progress) progress.done(message);
    else toast.success(message);
  } catch (error) {
    if (isCancel(error)) return progress?.fail(t('CANCELLED'));
    logger.error('Photo download', error);
    if (progress) progress.fail(error);
    else toast.error(error);
  }
}
