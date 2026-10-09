import { h, clear } from '../core/dom.js';
import { t, errorMessage } from '../core/i18n.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { logger } from '../core/logger.js';

const MARGIN = 8;
let current = null;

export function closeMenu() {
  current?.close();
}

export function closeMenuIfDetached() {
  if (current && !current.anchor.isConnected) closeMenu();
}

export function isMenuOpen(anchor) {
  return Boolean(current && (!anchor || current.anchor === anchor));
}

const SHIELDED_EVENTS = ['pointerdown', 'mousedown', 'mouseup', 'click', 'touchstart', 'keydown', 'wheel'];

export function openMenu(anchor, itemsOrLoader, { onClose, minWidth = 210, placement = 'bottom' } = {}) {
  if (current?.anchor === anchor) {
    closeMenu();
    return null;
  }
  closeMenu();

  const list = h('div', { class: 'ttp-menu-list', role: 'menu' });
  const menu = h('div', { class: 'ttp-menu ttp-root ttp-glass', style: { minWidth: `${minWidth}px` } }, list);

  SHIELDED_EVENTS.forEach(type => menu.addEventListener(type, e => e.stopPropagation()));

  const state = { anchor, close: null };
  current = state;

  const position = () => {
    const rect = anchor.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = menu;

    let left = rect.right - width;
    if (left < MARGIN) left = Math.min(rect.left, innerWidth - width - MARGIN);
    left = Math.max(MARGIN, Math.min(left, innerWidth - width - MARGIN));

    const below = rect.bottom + 6;
    const above = rect.top - 6 - height;
    const fitsBelow = below + height <= innerHeight - MARGIN;
    const fitsAbove = above >= MARGIN;
    const top = placement === 'top'
      ? (fitsAbove || !fitsBelow ? above : below)
      : (fitsBelow || !fitsAbove ? below : above);

    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(MARGIN, top)}px`;
    menu.style.transformOrigin = `${rect.left + rect.width / 2 - left}px ${top === below ? '0' : '100%'}`;
  };

  const onOutside = (e) => {
    if (!menu.contains(e.target) && !anchor.contains(e.target)) close();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      focusNext(e.key === 'ArrowDown' ? 1 : -1);
    }
  };
  const onScroll = (e) => {
    if (!menu.contains(e.target)) close();
  };

  function focusNext(direction) {
    const buttons = [...list.querySelectorAll('.ttp-menu-item:not([disabled])')];
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement);
    buttons[(index + direction + buttons.length) % buttons.length].focus();
  }

  function close() {
    if (state.closed) return;
    state.closed = true;
    if (current === state) current = null;

    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', onScroll, true);

    anchor.classList.remove('ttp-active');
    menu.classList.add('ttp-menu--out');
    setTimeout(() => menu.remove(), 160);
    Promise.resolve(state.pending).finally(() => onClose?.());
  }
  state.close = close;

  function render(items) {
    clear(list, items.filter(Boolean).map(renderItem));
    position();
  }

  function renderItem(item) {
    if (item.type === 'separator') return h('div', { class: 'ttp-menu-sep', role: 'separator' });

    if (item.type === 'header') {
      return h('div', { class: 'ttp-menu-header' },
        item.thumb ? h('img', { class: 'ttp-menu-thumb', src: item.thumb, alt: '' }) : null,
        h('div', { class: 'ttp-menu-header-text' },
          h('div', { class: 'ttp-menu-header-label' }, item.label),
          item.sublabel ? h('div', { class: 'ttp-menu-header-sub' }, item.sublabel) : null
        )
      );
    }

    if (item.type === 'message') {
      return h('div', { class: ['ttp-menu-message', item.error && 'ttp-menu-message--error'] }, item.label);
    }

    return h('button', {
      class: 'ttp-menu-item',
      role: 'menuitem',
      type: 'button',
      disabled: Boolean(item.disabled),
      on: {
        click: (e) => {
          e.preventDefault();
          state.pending = Promise.resolve()
            .then(() => item.onSelect?.())
            .catch((error) => {
              logger.error('Menu action', error);
              toast.error(error);
            });
          close();
        }
      }
    },
      item.icon ? icon(item.icon, { size: 18 }) : h('span', { class: 'ttp-icon' }),
      h('span', { class: 'ttp-menu-label' }, item.label),
      item.hint ? h('span', { class: 'ttp-menu-hint' }, item.hint) : null
    );
  }

  document.body.append(menu);
  anchor.classList.add('ttp-active');

  if (typeof itemsOrLoader === 'function') {
    render([{ type: 'message', label: t('LOADING') }]);
    list.firstChild.prepend(h('span', { class: 'ttp-spinner' }));
    Promise.resolve()
      .then(itemsOrLoader)
      .then(items => !state.closed && render(items))
      .catch(error => {
        logger.error('Menu loading', error);
        if (!state.closed) render([{ type: 'message', label: errorMessage(error), error: true }]);
      });
  } else {
    render(itemsOrLoader);
  }

  setTimeout(() => {
    if (state.closed) return;
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
  }, 0);

  return state;
}
