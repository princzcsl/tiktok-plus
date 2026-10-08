import { sendBackground } from '../core/runtime.js';

const PICKER_ID = 'tiktokplus-save';

export function isPickerSupported() {
  return typeof window.showSaveFilePicker === 'function';
}

const isMedia = (blob) => blob.size > 512 && !/text\/html|json/i.test(blob.type);

async function fetchBlob(urls) {
  for (const url of urls) {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) continue;
      const blob = await response.blob();
      if (isMedia(blob)) return blob;
    } catch {  }
  }

  const { dataUrl } = await sendBackground({ action: 'fetchDataUrl', urls });
  return (await fetch(dataUrl)).blob();
}

async function writeFile(handle, urls) {
  const blob = await fetchBlob(urls);
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function saveWithPicker(urls, filename) {
  const handle = await window.showSaveFilePicker({ id: PICKER_ID, suggestedName: filename, startIn: 'downloads' });
  await writeFile(handle, urls);
  return handle.name;
}

export function pickDirectory() {
  return window.showDirectoryPicker({ id: PICKER_ID, mode: 'readwrite', startIn: 'downloads' });
}

async function uniqueName(dir, filename) {
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  for (let i = 0; i < 1000; i++) {
    const name = i ? `${base} (${i})${ext}` : filename;
    try {
      await dir.getFileHandle(name);
    } catch {
      return name;
    }
  }
  return `${base}-${Date.now()}${ext}`;
}

export async function saveIntoDirectory(dir, urls, filename) {
  const name = await uniqueName(dir, filename);
  await writeFile(await dir.getFileHandle(name, { create: true }), urls);
  return `${dir.name} › ${name}`;
}
