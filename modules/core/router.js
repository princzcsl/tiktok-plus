const URL_POLL_INTERVAL = 700;

export function parseRoute(pathname = location.pathname) {
  const [first, second, third] = pathname.split('/').filter(Boolean);

  if (first?.startsWith('@') && first.length > 1) {
    const username = decodeURIComponent(first.slice(1));
    if ((second === 'video' || second === 'photo') && /^\d+$/.test(third || '')) {
      return { type: 'item', username, itemId: third };
    }
    return { type: 'profile', username };
  }

  if (!first || ['foryou', 'following', 'friends', 'explore'].includes(first)) return { type: 'feed' };
  return { type: 'other' };
}

export function watchUrl(callback) {
  let lastUrl = location.href;

  const check = () => {
    if (location.href === lastUrl) return;
    const previous = lastUrl;
    lastUrl = location.href;
    callback(location.href, previous);
  };

  if ('navigation' in window) {
    navigation.addEventListener('currententrychange', () => setTimeout(check, 0));
  }
  window.addEventListener('popstate', check);
  setInterval(check, URL_POLL_INTERVAL);
}
