import { t } from '../core/i18n.js';
import { sleep } from '../core/dom.js';
import { logger } from '../core/logger.js';
import { sendBackground } from '../core/runtime.js';
import { iconSvg } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { openAccountSwitcher, currentAccount } from '../ui/accountSwitcher.js';
import { removeInjected } from './common.js';

const FEATURE = 'accounts';
const LOGOUT_LABELS = [
  'Se déconnecter', 'Déconnexion', 'Log out', 'Log Out', 'Logout', 'Sign out', 'Abmelden', 'Cerrar sesión',
  'Esci', 'Sair', 'Wyloguj się', 'Uitloggen', 'Çıkış yap', 'Выйти', 'Keluar', 'ログアウト', '로그아웃', '退出登录', '登出'
];
const LOGOUT_XPATH = `//body//*[text()[${LOGOUT_LABELS.map(label => `normalize-space()='${label}'`).join(' or ')}]] | //body//*[contains(@data-e2e,'logout')]`;
const CLICKABLE = 'a, button, li, [role="menuitem"], [role="button"], [tabindex]';
const VIEWER_WAIT = 8000;

function logoutLabels() {
  const result = document.evaluate(LOGOUT_XPATH, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  const found = [];
  for (let i = 0; i < result.snapshotLength; i++) {
    const el = result.snapshotItem(i);
    if (!el.closest('.ttp-root, [data-ttp-feature]')) found.push(el);
  }
  return found;
}

function logoutItem(label) {
  const start = label.closest('[data-e2e*="logout"]') || label;
  const clickable = start.closest(CLICKABLE);
  if (clickable && clickable !== document.body && clickable.textContent.trim().length <= 40) return clickable;

  let item = start;
  while (item.parentElement && item.parentElement !== document.body && item.parentElement.children.length === 1) {
    item = item.parentElement;
  }
  return item;
}

function relabel(clone) {
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  let replaced = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!LOGOUT_LABELS.includes(node.nodeValue.trim())) continue;
    node.nodeValue = replaced ? '' : t('ACCOUNT_SWITCH');
    replaced = true;
  }
  if (!replaced) clone.append(t('ACCOUNT_SWITCH'));
}

function swapIcon(clone) {
  const original = clone.querySelector('svg');
  if (!original) return;
  const size = Math.round(original.getBoundingClientRect?.().width || 0) || Number(original.getAttribute('width')) || 20;
  const template = document.createElement('template');
  template.innerHTML = iconSvg('switchUser', { size, stroke: 2 });
  const replacement = template.content.firstElementChild;
  const className = original.getAttribute('class');
  if (className) replacement.setAttribute('class', className);
  original.replaceWith(replacement);
}

function buildSwitchItem(item) {
  const clone = item.cloneNode(true);
  [clone, ...clone.querySelectorAll('[id], [href], [data-e2e]')].forEach(el => {
    el.removeAttribute('id');
    el.removeAttribute('href');
    el.removeAttribute('data-e2e');
  });
  relabel(clone);
  swapIcon(clone);
  clone.classList.add('ttp-account-switch');
  clone.dataset.ttpFeature = FEATURE;
  clone.setAttribute('role', 'menuitem');
  clone.title = t('ACCOUNT_SWITCH');

  const activate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openAccountSwitcher().catch(error => toast.error(error));
  };
  clone.addEventListener('click', activate, true);
  clone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') activate(e); }, true);
  ['pointerdown', 'mousedown', 'mouseup', 'touchstart'].forEach(type => clone.addEventListener(type, e => e.stopPropagation()));
  return clone;
}

async function markLoggedOut() {
  const viewer = await currentAccount();
  if (viewer) await sendBackground({ action: 'accountLoggedOut', id: viewer.id });
}

function inject() {
  for (const label of logoutLabels()) {
    const item = logoutItem(label);
    if (!item?.parentElement || item.previousElementSibling?.classList.contains('ttp-account-switch')) continue;
    item.before(buildSwitchItem(item));
    if (!item.dataset.ttpLogout) {
      item.dataset.ttpLogout = '1';
      item.addEventListener('click', () => markLoggedOut().catch(() => {}), true);
    }
  }
}

export async function reportAccount() {
  let viewer = null;
  for (const started = Date.now(); Date.now() - started < VIEWER_WAIT; await sleep(1000)) {
    viewer = await currentAccount();
    if (viewer) break;
  }
  try {
    const { expired } = await sendBackground({ action: 'accountSeen', viewer });
    if (expired) toast(t('ACCOUNT_EXPIRED_TOAST', { username: expired }), { duration: 7000 });
  } catch (error) {
    logger.warning('Account not saved', error.message);
  }
}

export const accountsFeature = {
  name: FEATURE,
  routes: '*',
  enter() {},
  scan: inject,
  leave() {
    removeInjected(FEATURE);
  }
};
