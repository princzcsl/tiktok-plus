import { sendBackground } from '../core/runtime.js';
import { sanitizeFilename } from '../core/dom.js';
import { isPickerSupported, saveWithPicker, pickDirectory, saveIntoDirectory } from './save.js';

function stamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function buildName({ username, kind, id, createTime, index = null }) {
  const date = stamp(createTime ? new Date(createTime * 1000) : new Date());
  const name = [username || 'tiktok', kind, date, index != null ? String(index + 1).padStart(2, '0') : null, id]
    .filter(Boolean)
    .join('_');
  return sanitizeFilename(name);
}

function guessExt(urls, fallback) {
  try {
    const match = new URL(urls[0]).pathname.match(/\.(mp4|jpe?g|png|webp|gif|avif)(?:$|[~?])/i);
    if (match) return match[1].toLowerCase().replace('jpeg', 'jpg');
  } catch {  }
  return fallback;
}

async function downloadFile(urls, name, fallbackExt, dir = null) {
  if (!urls?.length) throw new Error('no_url');
  const filename = `${name}.${guessExt(urls, fallbackExt)}`;

  if (dir) return saveIntoDirectory(dir, urls, filename);
  if (isPickerSupported()) return saveWithPicker(urls, filename);
  await sendBackground({ action: 'download', urls, filename: name, fallbackExt, saveAs: true });
  return null;
}

const kindOf = (item, base) => (item.isStory ? `story-${base}` : base);

export function downloadVideo(item) {
  return downloadFile(item.videoUrls, buildName({ ...item, kind: kindOf(item, 'video') }), 'mp4');
}

export function downloadPhoto(item, index, dir = null) {
  return downloadFile(
    item.images[index]?.urls,
    buildName({ ...item, kind: kindOf(item, 'photo'), index: item.images.length > 1 ? index : null }),
    'jpg',
    dir
  );
}

export async function downloadAllPhotos(item, onProgress = () => {}) {
  const dir = isPickerSupported() ? await pickDirectory() : null;
  for (let index = 0; index < item.images.length; index++) {
    await downloadPhoto(item, index, dir);
    onProgress(index + 1, item.images.length);
  }
  return dir?.name || null;
}

export function downloadThumbnail(item) {
  return downloadFile(item.coverUrls, buildName({ ...item, kind: kindOf(item, 'thumb') }), 'jpg');
}

export function downloadAvatar(user) {
  return downloadFile([user.avatarHD], buildName({ username: user.username, kind: 'avatar', id: user.id }), 'jpg');
}

export function downloadMedia(item, photoIndex = 0) {
  return item.type === 'photo' ? downloadPhoto(item, photoIndex) : downloadVideo(item);
}
