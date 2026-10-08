export const DEFAULT_SETTINGS = {
  saveMode: 'ask',
  quality: 'best',
  playbackRate: 1,
  showSpeedButton: true,
  showDate: true,
  hoverButton: true,
  shortcuts: true,
  keys: { download: 'd', audio: 'a', capture: 'x' },
  autoSync: true
};

export const store = {
  async get(key, fallback = null) {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? fallback;
  },

  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },

  async remove(key) {
    await chrome.storage.local.remove(key);
  },

  onChange(key, callback) {
    const listener = (changes, area) => {
      if (area === 'local' && changes[key]) callback(changes[key].newValue, changes[key].oldValue);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
};

const merge = (value) => ({
  ...DEFAULT_SETTINGS,
  ...(value || {}),
  keys: { ...DEFAULT_SETTINGS.keys, ...(value?.keys || {}) }
});

let settingsCache = null;

export async function getSettings() {
  if (!settingsCache) settingsCache = merge(await store.get('settings', {}));
  return settingsCache;
}

export function cachedSettings() {
  return settingsCache || merge({});
}

export async function updateSettings(patch) {
  const settings = merge({ ...(await getSettings()), ...patch });
  settingsCache = settings;
  await store.set('settings', settings);
  return settings;
}

store.onChange('settings', (value) => {
  settingsCache = merge(value);
});
