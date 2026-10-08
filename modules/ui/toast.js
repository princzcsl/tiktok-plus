import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { errorMessage } from '../core/i18n.js';

const ICONS = { success: 'check', error: 'info', info: 'info', progress: 'sync', download: 'download' };

function getStack() {
  let stack = document.querySelector('.ttp-toast-stack');
  if (!stack) {
    stack = h('div', { class: 'ttp-toast-stack ttp-root', 'aria-live': 'polite' });
    document.body.append(stack);
  }
  return stack;
}

function createToast(message, type) {
  const label = h('span', { class: 'ttp-toast-label' }, message);
  const bar = h('div', { class: 'ttp-toast-bar' });
  const el = h('div', { class: ['ttp-toast', 'ttp-glass', `ttp-toast--${type}`] },
    icon(ICONS[type] || 'info', { size: 18, className: type === 'progress' ? 'ttp-spin' : '' }),
    label,
    type === 'progress' ? bar : null
  );
  getStack().append(el);
  return { el, label, bar };
}

function dismiss(el, delay = 0) {
  setTimeout(() => {
    el.classList.add('ttp-toast--out');
    setTimeout(() => el.remove(), 250);
  }, delay);
}

export function toast(message, { type = 'info', duration = 2600 } = {}) {
  const { el } = createToast(message, type);
  dismiss(el, duration);
}

toast.success = (message, options) => toast(message, { ...options, type: 'success' });
toast.download = (message, options) => toast(message, { duration: 3000, ...options, type: 'download' });
toast.error = (messageOrError, options) => toast(
  typeof messageOrError === 'string' ? messageOrError : errorMessage(messageOrError),
  { duration: 4000, ...options, type: 'error' }
);

toast.progress = (message) => {
  const { el, label, bar } = createToast(message, 'progress');

  const finish = (text, type, duration) => {
    el.classList.remove('ttp-toast--progress');
    el.classList.add(`ttp-toast--${type}`);
    el.firstChild.replaceWith(icon(ICONS[type], { size: 18 }));
    label.textContent = text;
    bar.remove();
    dismiss(el, duration);
  };

  return {
    update(text, ratio = null) {
      if (text) label.textContent = text;
      if (ratio !== null) bar.style.setProperty('--ttp-progress', `${Math.round(Math.min(1, ratio) * 100)}%`);
    },
    done: (text) => finish(text, 'success', 2600),
    fail: (error) => finish(typeof error === 'string' ? error : errorMessage(error), 'error', 4500)
  };
};
