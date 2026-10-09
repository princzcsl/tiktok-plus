const DEBUG_MODE = true;

function log(emoji, message, ...args) {
  if (!DEBUG_MODE) return;
  console.log(`${emoji} ${message}`, ...args);
}

log('🟢', 'Background script loaded');


const CDN_DOMAINS = [
  'tiktok.com', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'tiktokv.com',
  'tiktokv.us', 'tiktokv.eu', 'ibyteimg.com', 'byteoversea.com', 'muscdn.com'
];

let rulesReady = null;

function ensureRules() {
  rulesReady ||= chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'referer', operation: 'set', value: 'https://www.tiktok.com/' },
          { header: 'origin', operation: 'set', value: 'https://www.tiktok.com' }
        ]
      },
      condition: {
        tabIds: [chrome.tabs.TAB_ID_NONE],
        requestDomains: CDN_DOMAINS,
        resourceTypes: ['xmlhttprequest', 'media', 'image', 'other']
      }
    }]
  }).catch(error => {
    rulesReady = null;
    log('❌', 'Unable to set the Referer rule:', error);
  });
  return rulesReady;
}

ensureRules();


function assertUrl(url) {
  const value = String(url || '');
  if (value.startsWith('https://')) return value;
  throw new Error('invalid_url');
}

const HANDLERS = {
  download: async ({ urls, filename, fallbackExt, saveAs }) => download(urls.map(assertUrl), filename, fallbackExt, saveAs),
  downloadDataUrl: async ({ dataUrl, filename, saveAs }) => {
    if (!String(dataUrl).startsWith('data:image/')) throw new Error('invalid_url');
    const downloadId = await chrome.downloads.download({ url: dataUrl, filename, conflictAction: 'uniquify', saveAs: Boolean(saveAs) });
    return { downloadId };
  },
  setBadge: async ({ count }) => {
    await chrome.action.setBadgeBackgroundColor({ color: '#fe2c55' });
    await chrome.action.setBadgeText({ text: count > 0 ? (count > 99 ? '99+' : String(count)) : '' });
    return {};
  },
  fetchDataUrl: async ({ urls }) => {
    const { blob } = await fetchFirst(urls.map(assertUrl));
    return { dataUrl: await blobToDataUrl(blob) };
  },
  openTab: async ({ url }, sender) => {
    await chrome.tabs.create({ url: assertUrl(url), index: sender.tab ? sender.tab.index + 1 : undefined });
    return {};
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handler = HANDLERS[request?.action];
  if (!handler) return false;

  handler(request, sender)
    .then(result => sendResponse(result ?? {}))
    .catch(error => {
      log('❌', `${request.action} error:`, error);
      sendResponse({ error: error.message || String(error) });
    });

  return true;
});


const MIME_EXTENSIONS = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic'
};

function extensionOf(blob, url, fallback) {
  const fromMime = MIME_EXTENSIONS[(blob.type || '').split(';')[0].trim().toLowerCase()];
  if (fromMime) return fromMime;
  const match = new URL(url).pathname.match(/\.(mp4|mp3|m4a|jpe?g|png|webp|gif|avif)(?:$|[~?])/i);
  if (match) return match[1].toLowerCase().replace('jpeg', 'jpg');
  return fallback || 'bin';
}

async function fetchFirst(urls) {
  if (!urls.length) throw new Error('no_url');
  await ensureRules();

  for (const url of urls) {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        log('⚠️', `HTTP ${response.status}`, url);
        continue;
      }
      const blob = await response.blob();
      if (blob.size < 512 || /text\/html|json/i.test(blob.type)) continue;
      return { blob, url };
    } catch (error) {
      log('⚠️', 'Failed, trying next URL:', error.message);
    }
  }
  throw new Error('no_url');
}

async function download(urls, filename, fallbackExt, saveAs = false) {
  try {
    const { blob, url } = await fetchFirst(urls);
    const ext = extensionOf(blob, url, fallbackExt);
    log('⬇️', 'Download:', `${filename}.${ext}`, `${(blob.size / 1048576).toFixed(1)} MB`);
    const downloadId = await chrome.downloads.download({
      url: await blobToDataUrl(blob),
      filename: `${filename}.${ext}`,
      conflictAction: 'uniquify',
      saveAs: Boolean(saveAs)
    });
    return { downloadId };
  } catch (error) {
    if (error.message !== 'no_url' || !urls.length) throw error;
  }

  log('🔁', 'Falling back to a direct chrome.downloads download');
  const downloadId = await chrome.downloads.download({
    url: urls[0],
    filename: `${filename}.${fallbackExt || 'mp4'}`,
    conflictAction: 'uniquify',
    saveAs: Boolean(saveAs)
  });
  return { downloadId };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}


async function openPanelIn(tab, panelTab = 'following') {
  const isTikTok = /^https:\/\/([a-z0-9-]+\.)?tiktok\.com\//.test(tab?.url || '');

  if (!isTikTok) {
    await chrome.tabs.create({ url: 'https://www.tiktok.com/' });
    return;
  }

  const message = { action: 'openPanel', tab: panelTab };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    log('🔁', 'Content script missing, injecting it again');
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['styles.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    setTimeout(() => chrome.tabs.sendMessage(tab.id, message).catch(() => {}), 800);
  }
}

chrome.action.onClicked.addListener((tab) => openPanelIn(tab));

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'open-panel') return;
  const target = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  openPanelIn(target);
});
