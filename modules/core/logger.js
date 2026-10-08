const DEBUG = true;
const PREFIX = '[TikTok+]';

const write = (method, emoji) => (...args) => {
  if (DEBUG || method === 'error') console[method](`${emoji} ${PREFIX}`, ...args);
};

export const logger = {
  info: write('log', 'ℹ️'),
  success: write('log', '✅'),
  warning: write('warn', '⚠️'),
  error: write('error', '❌'),
  pageChange: (from, to) => DEBUG && console.log(`🧭 ${PREFIX} Page : ${from ?? '∅'} → ${to}`)
};
