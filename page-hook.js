(() => {
  if (window.__ttpHook) return;
  window.__ttpHook = true;

  const SOURCE = 'ttp-hook';
  const RELEVANT_URL = /\/api\//;
  const STORY_URL = /\/story\//;
  const MAX_TEXT = 12 * 1024 * 1024;

  const COMMON_KEYS = [
    'aid', 'app_language', 'app_name', 'browser_language', 'browser_name', 'browser_online',
    'browser_platform', 'browser_version', 'channel', 'cookie_enabled', 'data_collection_enabled',
    'device_id', 'device_platform', 'focus_state', 'history_len', 'is_fullscreen', 'is_page_visible',
    'odinId', 'os', 'priority_region', 'region', 'screen_height', 'screen_width', 'tz_name',
    'user_is_login', 'verifyFp', 'webcast_language'
  ];
  let commonParams = null;

  const isId = (value) => value !== undefined && value !== null && value !== '' && /^\d+$/.test(String(value));

  function trimUser(node) {
    return {
      id: String(node.id),
      uniqueId: node.uniqueId,
      nickname: node.nickname,
      secUid: node.secUid,
      verified: node.verified,
      avatarThumb: node.avatarThumb,
      avatarMedium: node.avatarMedium,
      avatarLarger: node.avatarLarger
    };
  }

  function trimItem(node) {
    const video = node.video;
    const post = node.imagePost;
    return {
      id: String(node.id),
      desc: node.desc || '',
      createTime: Number(node.createTime) || 0,
      author: node.author && typeof node.author === 'object' ? trimUser(node.author) : (node.author || null),
      authorId: node.authorId ? String(node.authorId) : null,
      video: video ? {
        width: video.width,
        height: video.height,
        duration: video.duration,
        cover: video.cover,
        originCover: video.originCover,
        zoomCover: video.zoomCover,
        playAddr: video.playAddr,
        downloadAddr: video.downloadAddr,
        bitrateInfo: (video.bitrateInfo || []).map(b => ({
          Bitrate: b.Bitrate,
          CodecType: b.CodecType,
          PlayAddr: b.PlayAddr ? { UrlList: b.PlayAddr.UrlList, Width: b.PlayAddr.Width, Height: b.PlayAddr.Height } : null
        }))
      } : null,
      music: node.music ? {
        playUrl: node.music.playUrl,
        title: node.music.title,
        authorName: node.music.authorName
      } : null,
      imagePost: post ? {
        images: (post.images || []).map(img => ({ imageURL: img.imageURL, imageWidth: img.imageWidth, imageHeight: img.imageHeight })),
        cover: post.cover || null
      } : null
    };
  }

  const isItem = (node) => isId(node.id) && (
    (node.video && typeof node.video === 'object' && (node.video.playAddr || node.video.cover || node.video.bitrateInfo)) ||
    (Array.isArray(node.imagePost?.images) && node.imagePost.images.length)
  );

  const isUser = (node) => typeof node.uniqueId === 'string' && isId(node.id) &&
    Boolean(node.avatarLarger || node.avatarMedium || node.avatarThumb);

  function collect(root, { story = false } = {}) {
    const items = new Map();
    const users = new Map();
    const stack = [[root, 0]];

    while (stack.length) {
      const [node, depth] = stack.pop();
      if (!node || typeof node !== 'object' || depth > 40) continue;

      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) stack.push([node[i], depth + 1]);
        continue;
      }

      if (isItem(node)) items.set(String(node.id), trimItem(node));
      if (isUser(node)) users.set(String(node.id), Object.assign(users.get(String(node.id)) || {}, trimUser(node)));

      const children = Object.values(node).filter(value => value && typeof value === 'object');
      for (let i = children.length - 1; i >= 0; i--) stack.push([children[i], depth + 1]);
    }

    if (items.size || users.size) {
      window.postMessage({ source: SOURCE, items: [...items.values()], users: [...users.values()], story }, location.origin);
    }
  }

  function scanText(text, url = '') {
    if (typeof text !== 'string' || !text || text.length > MAX_TEXT) return;
    if (!/"(uniqueId|playAddr|imagePost)"/.test(text)) return;
    try {
      collect(JSON.parse(text), { story: STORY_URL.test(pathOf(url)) });
    } catch {}
  }

  function pathOf(url) {
    try { return new URL(url, location.origin).pathname; } catch { return ''; }
  }

  function captureParams(url) {
    try {
      const parsed = new URL(url, location.origin);
      if (!/(^|\.)tiktok\.com$/.test(parsed.hostname) || !parsed.pathname.startsWith('/api/') || !parsed.searchParams.has('aid')) return;
      const params = {};
      COMMON_KEYS.forEach(key => {
        if (parsed.searchParams.has(key)) params[key] = parsed.searchParams.get(key);
      });
      commonParams = params;

      if (STORY_URL.test(parsed.pathname) && !/item_list/.test(parsed.pathname)) {
        console.debug('[TikTok+] story request:', parsed.pathname);
      }
    } catch {}
  }

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const promise = originalFetch.apply(this, args);
    try {
      const url = String(args[0]?.url || args[0] || '');
      captureParams(url);
      if (RELEVANT_URL.test(url)) {
        promise.then(response => response.clone().text()).then(text => scanText(text, url)).catch(() => {});
      }
    } catch {}
    return promise;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__ttpUrl = String(url || '');
    captureParams(this.__ttpUrl);
    return originalOpen.call(this, method, url, ...rest);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (RELEVANT_URL.test(this.__ttpUrl || '')) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') scanText(this.responseText, this.__ttpUrl);
          else if (this.responseType === 'json' && this.response) collect(this.response, { story: STORY_URL.test(pathOf(this.__ttpUrl)) });
        } catch {}
      });
    }
    return originalSend.apply(this, args);
  };

  function defaultParams() {
    return {
      aid: '1988',
      app_name: 'tiktok_web',
      app_language: navigator.language.split('-')[0] || 'fr',
      browser_language: navigator.language,
      browser_name: 'Mozilla',
      browser_online: 'true',
      browser_platform: navigator.platform,
      browser_version: navigator.userAgent.replace(/^Mozilla\//, ''),
      channel: 'tiktok_web',
      cookie_enabled: 'true',
      device_platform: 'web_pc',
      focus_state: 'true',
      history_len: String(history.length),
      is_fullscreen: 'false',
      is_page_visible: 'true',
      screen_height: String(screen.height),
      screen_width: String(screen.width),
      tz_name: Intl.DateTimeFormat().resolvedOptions().timeZone,
      webcast_language: navigator.language.split('-')[0] || 'fr'
    };
  }

  function buildUrl(path, params) {
    const url = new URL(path, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) throw new Error('invalid_path');
    const search = new URLSearchParams(commonParams || defaultParams());
    for (const [key, value] of Object.entries(params || {})) search.set(key, String(value));
    url.search = search.toString();
    return url.toString();
  }

  function reply(id, payload) {
    window.postMessage({ source: SOURCE, reply: id, ...payload }, location.origin);
  }

  function request({ id, path, params }) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', buildUrl(path, params));
      xhr.withCredentials = true;
      xhr.onload = () => reply(id, { status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reply(id, { error: 'network' });
      xhr.send();
    } catch (error) {
      reply(id, { error: error.message || 'request_failed' });
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'ttp-content') return;
    if (event.data.action === 'request' && typeof event.data.id === 'string') request(event.data);
  });

  const scanEmbedded = () => {
    document.querySelectorAll('script#__UNIVERSAL_DATA_FOR_REHYDRATION__, script#SIGI_STATE, script#__NEXT_DATA__')
      .forEach(script => scanText(script.textContent));

    try {
      const universal = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      const me = JSON.parse(universal?.textContent || '{}')?.__DEFAULT_SCOPE__?.['webapp.app-context']?.user;
      if (me?.uid && me?.secUid) {
        window.postMessage({ source: SOURCE, viewer: { id: String(me.uid), secUid: me.secUid, username: me.uniqueId || '' } }, location.origin);
      }
    } catch {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanEmbedded, { once: true });
  else scanEmbedded();
})();
