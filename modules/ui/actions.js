import { t } from '../core/i18n.js';
import { logger } from '../core/logger.js';
import { downloadAllPhotos, downloadPhoto } from '../services/downloads.js';
import { toast } from './toast.js';

const isCancel = (error) => error?.name === 'AbortError';

export async function runDownload(task, { thumbnail = false } = {}) {
  try {
    const saved = await task();
    toast.download(saved ? t('DL_SAVED_AT', { where: saved }) : t(thumbnail ? 'DL_THUMB_STARTED' : 'DL_STARTED'));
  } catch (error) {
    if (isCancel(error)) return;
    logger.error('Téléchargement', error);
    toast.error(error);
  }
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
    logger.error('Téléchargement photos', error);
    if (progress) progress.fail(error);
    else toast.error(error);
  }
}
