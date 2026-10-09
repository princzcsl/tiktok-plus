import { sendBackground } from '../core/runtime.js';
import { sanitizeFilename } from '../core/dom.js';
import { cachedSettings } from '../core/storage.js';
import { fetchItem } from '../api/tiktok.js';
import { isPickerSupported, saveWithPicker, saveBlobWithPicker, pickDirectory, saveIntoDirectory } from './save.js';

const DOWNLOAD_ROOT = 'TikTok+';

export function buildName(username, ...parts) {
  return sanitizeFilename([username || 'tiktok', ...parts.filter(part => part !== null && part !== undefined && part !== '')].join('_'));
}

function guessExt(urls, fallback) {
  try {
    const match = new URL(urls[0]).pathname.match(/\.(mp4|mp3|m4a|jpe?g|png|webp|gif|avif)(?:$|[~?])/i);
    if (match) return match[1].toLowerCase().replace('jpeg', 'jpg');
  } catch {}
  return fallback;
}

const askMode = () => cachedSettings().saveMode !== 'downloads';

async function downloadFile(urls, name, fallbackExt, dir = null, refresh = null) {
  if (!urls?.length && !refresh) throw new Error('no_url');
  const filename = `${name}.${guessExt(urls?.length ? urls : [''], fallbackExt)}`;

  if (dir) return saveIntoDirectory(dir, urls, filename, refresh);
  if (askMode() && isPickerSupported()) return saveWithPicker(urls, filename, refresh);

  const send = (list) => sendBackground({ action: 'download', urls: list, filename: askMode() ? name : `${DOWNLOAD_ROOT}/${name}`, fallbackExt, saveAs: askMode() });
  try {
    await send(urls);
  } catch (error) {
    if (!refresh || error.message !== 'no_url') throw error;
    await send(await refresh());
  }
  return askMode() ? null : `${DOWNLOAD_ROOT} › ${filename}`;
}

export async function openBatch() {
  return askMode() && isPickerSupported() ? pickDirectory() : null;
}

export const videoVariant = (item) => item.video[cachedSettings().quality === 'compat' ? 'compat' : 'best'];

export function downloadVideo(item, dir = null) {
  const refresh = async () => videoVariant(await fetchItem(item.id, item.username, { fresh: true })).urls;
  return downloadFile(videoVariant(item).urls, buildName(item.username, item.id), 'mp4', dir, refresh);
}

export function downloadPhoto(item, index, dir = null) {
  const suffix = item.images.length > 1 ? String(index + 1).padStart(2, '0') : null;
  return downloadFile(item.images[index]?.urls, buildName(item.username, item.id, suffix), 'jpg', dir);
}

export async function downloadAllPhotos(item, onProgress = () => {}, dir = null) {
  const target = dir || await openBatch();
  for (let index = 0; index < item.images.length; index++) {
    await downloadPhoto(item, index, target);
    onProgress(index + 1, item.images.length);
  }
  return target?.name || null;
}

export function downloadThumbnail(item) {
  return downloadFile(item.coverUrls, buildName(item.username, item.id, 'miniature'), 'jpg');
}

export function downloadAudio(item) {
  return downloadFile(item.audio.urls, buildName(item.username, item.id), 'mp3');
}

export function downloadAvatar(user) {
  return downloadFile([user.avatarHD], buildName(user.username, 'photo-profil'), 'jpg');
}

export async function downloadItem(item, dir = null) {
  if (item.type === 'photo') {
    for (let index = 0; index < item.images.length; index++) await downloadPhoto(item, index, dir);
    return;
  }
  await downloadVideo(item, dir);
}

export function downloadMedia(item, photoIndex = 0) {
  return item.type === 'photo' ? downloadPhoto(item, photoIndex) : downloadVideo(item);
}

export async function downloadCanvas(canvas, item) {
  const filename = `${buildName(item.username, item.id, 'capture')}.png`;
  const toBlob = () => new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('capture_failed'))), 'image/png'));

  if (askMode() && isPickerSupported()) return saveBlobWithPicker(toBlob, filename);

  const dataUrl = canvas.toDataURL('image/png');
  await sendBackground({ action: 'downloadDataUrl', dataUrl, filename: askMode() ? filename : `${DOWNLOAD_ROOT}/${filename}`, saveAs: askMode() });
  return askMode() ? null : `${DOWNLOAD_ROOT} › ${filename}`;
}
