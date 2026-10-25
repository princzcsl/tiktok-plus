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
  },
  accountList: async () => ({ accounts: publicAccounts(await loadAccounts()) }),
  accountSeen: async ({ viewer }, sender) => accountSeen(viewer, sender.tab),
  accountSwitch: async ({ id, viewer }, sender) => accountSwitch(id, viewer, sender.tab),
  accountAdd: async ({ viewer }, sender) => accountAdd(viewer, sender.tab),
  accountLoggedOut: async ({ id }) => {
    const accounts = await loadAccounts();
    if (accounts[id]) {
      accounts[id].expired = true;
      await saveAccounts(accounts);
    }
    return {};
  },
  accountRemove: async ({ id }) => {
    const accounts = await loadAccounts();
    delete accounts[id];
    await saveAccounts(accounts);
    return { accounts: publicAccounts(accounts) };
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


const ACCOUNTS_KEY = 'accountSessions';
const SESSION_COOKIES = ['sessionid', 'sessionid_ss', 'sid_tt'];
const AVATAR_MAX_AGE = 3 * 24 * 3600 * 1000;

async function loadAccounts() {
  const result = await chrome.storage.local.get(ACCOUNTS_KEY);
  return result[ACCOUNTS_KEY] || {};
}

async function saveAccounts(accounts) {
  await chrome.storage.local.set({ [ACCOUNTS_KEY]: accounts });
}

function publicAccounts(accounts) {
  return Object.values(accounts)
    .map(({ cookies, ...account }) => account)
    .sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0));
}

async function storeOf(tab) {
  if (!tab?.id) return undefined;
  const stores = await chrome.cookies.getAllCookieStores();
  return stores.find(store => store.tabIds.includes(tab.id))?.id;
}

const cookieUrl = (cookie) => `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`;

async function readSession(storeId) {
  const cookies = await chrome.cookies.getAll({ domain: 'tiktok.com', storeId });
  return cookies.some(c => SESSION_COOKIES.includes(c.name) && c.value) ? cookies : null;
}

async function clearSession(storeId) {
  const cookies = await chrome.cookies.getAll({ domain: 'tiktok.com', storeId });
  await Promise.all(cookies.map(c => chrome.cookies.remove({
    url: cookieUrl(c),
    name: c.name,
    storeId,
    ...(c.partitionKey ? { partitionKey: c.partitionKey } : {})
  }).catch(() => {})));
}

async function writeSession(cookies, storeId) {
  const now = Date.now() / 1000;
  await Promise.all(cookies.filter(c => c.session || !c.expirationDate || c.expirationDate > now).map(c => {
    const details = { url: cookieUrl(c), name: c.name, value: c.value, path: c.path, secure: c.secure, httpOnly: c.httpOnly, storeId };
    if (!c.hostOnly) details.domain = c.domain;
    if (c.sameSite && c.sameSite !== 'unspecified') details.sameSite = c.sameSite;
    if (!c.session && c.expirationDate) details.expirationDate = c.expirationDate;
    if (c.partitionKey) details.partitionKey = c.partitionKey;
    return chrome.cookies.set(details).catch(error => log('⚠️', `Cookie ${c.name} not restored:`, error.message));
  }));
}

async function avatarData(url) {
  try {
    const { blob } = await fetchFirst([assertUrl(url)]);
    return await blobToDataUrl(blob);
  } catch {
    return '';
  }
}

async function rememberCurrent(accounts, viewer, storeId) {
  if (!viewer?.id) return false;
  const cookies = await readSession(storeId);
  if (!cookies) return false;

  const previous = accounts[viewer.id] || {};
  const account = {
    ...previous,
    id: String(viewer.id),
    username: viewer.username || previous.username || '',
    nickname: viewer.nickname || previous.nickname || '',
    avatarUrl: viewer.avatar || previous.avatarUrl || '',
    cookies,
    expired: false,
    savedAt: Date.now(),
    usedAt: Date.now()
  };
  if (account.avatarUrl && (!previous.avatar || previous.avatarUrl !== account.avatarUrl || Date.now() - (previous.avatarAt || 0) > AVATAR_MAX_AGE)) {
    account.avatar = (await avatarData(account.avatarUrl)) || previous.avatar || '';
    account.avatarAt = Date.now();
  }
  accounts[account.id] = account;
  return true;
}

async function accountSeen(viewer, tab) {
  const storeId = await storeOf(tab);
  const accounts = await loadAccounts();
  const { pendingAccount } = await chrome.storage.session.get('pendingAccount');
  let expired = null;

  if (pendingAccount) {
    await chrome.storage.session.remove('pendingAccount');
    if (viewer?.id !== pendingAccount && accounts[pendingAccount]) {
      accounts[pendingAccount].expired = true;
      expired = accounts[pendingAccount].username;
    }
  }

  await rememberCurrent(accounts, viewer, storeId);
  await saveAccounts(accounts);
  return { expired, accounts: publicAccounts(accounts) };
}

async function accountSwitch(id, viewer, tab) {
  const storeId = await storeOf(tab);
  const accounts = await loadAccounts();
  const target = accounts[id];
  if (!target) throw new Error('not_found');

  await rememberCurrent(accounts, viewer, storeId);
  await saveAccounts(accounts);
  await clearSession(storeId);

  if (target.expired) {
    log('🔑', `Session of @${target.username} expired, opening the login page`);
    return { login: true };
  }

  await writeSession(target.cookies, storeId);
  await chrome.storage.session.set({ pendingAccount: id });
  log('🔁', `Switched to @${target.username}`);
  return { login: false };
}

async function accountAdd(viewer, tab) {
  const storeId = await storeOf(tab);
  const accounts = await loadAccounts();
  await rememberCurrent(accounts, viewer, storeId);
  await saveAccounts(accounts);
  await clearSession(storeId);
  return {};
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
