import { h } from '../core/dom.js';
import { closeMenu, isMenuOpen } from './menu.js';

const stack = [];
const whenAllClosed = new Set();

export function hasOpenOverlay() {
  return stack.length > 0;
}

export function onAllOverlaysClosed(callback) {
  if (!stack.length) callback();
  else whenAllClosed.add(callback);
}

function onDocumentKey(e) {
  const top = stack[stack.length - 1];
  if (!top) return;

  if (isMenuOpen() || e.target.closest?.('.ttp-menu')) return;

  if (!top.root.contains(e.target)) {
    e.stopPropagation();
    top.handleKey(e);
  }
}

function lockScroll(locked) {
  document.documentElement.classList.toggle('ttp-scroll-lock', locked);
}

export function openOverlay({ className = '', onClose, onKey, closeOnBackdrop = true } = {}) {
  closeMenu();

  const root = h('div', {
    class: ['ttp-overlay', 'ttp-root', className],
    role: 'dialog',
    'aria-modal': 'true',
    tabindex: '-1'
  });

  const entry = {
    root,
    closed: false,
    handleKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      onKey?.(e);
    }
  };

  function close() {
    if (entry.closed) return;
    entry.closed = true;

    const index = stack.indexOf(entry);
    if (index >= 0) stack.splice(index, 1);
    if (!stack.length) {
      document.removeEventListener('keydown', onDocumentKey, true);
      lockScroll(false);
    }

    root.querySelectorAll('video').forEach(v => v.pause());
    root.classList.add('ttp-overlay--out');
    setTimeout(() => root.remove(), 200);
    onClose?.();

    if (!stack.length) {
      const callbacks = [...whenAllClosed];
      whenAllClosed.clear();
      callbacks.forEach(cb => cb());
    }
  }
  entry.close = close;

  root.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const typing = e.target.matches?.('input, textarea, select');
    if (!typing || e.key === 'Escape') entry.handleKey(e);
  });
  ['click', 'pointerdown', 'mousedown', 'wheel', 'touchstart'].forEach(type =>
    root.addEventListener(type, e => e.stopPropagation())
  );

  if (closeOnBackdrop) {
    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });
  }

  if (!stack.length) {
    document.addEventListener('keydown', onDocumentKey, true);
    lockScroll(true);
  }
  stack.push(entry);

  document.body.append(root);
  requestAnimationFrame(() => root.focus({ preventScroll: true }));

  return { root, close };
}

export function closeAllOverlays() {
  [...stack].reverse().forEach(entry => entry.close());
}
