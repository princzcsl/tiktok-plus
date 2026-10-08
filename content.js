(() => {
  if (window.__ttpLoaded && window.__ttpAlive?.()) return;
  window.__ttpLoaded = true;
  window.__ttpAlive = () => {
    try { return Boolean(chrome.runtime?.id); } catch { return false; }
  };

  window.__ttpPageBuffer = [];
  window.addEventListener('message', (event) => {
    if (event.source === window && event.data?.source === 'ttp-hook' && !event.data.reply && window.__ttpPageBuffer) {
      window.__ttpPageBuffer.push(event.data);
    }
  });

  import(chrome.runtime.getURL('modules/main.js'))
    .then(({ start }) => start())
    .catch(error => console.error('❌ [TikTok+] Chargement impossible :', error));
})();
