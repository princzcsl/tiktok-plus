import { h, clear } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { logger } from '../core/logger.js';
import { sendBackground } from '../core/runtime.js';
import { getViewer, fetchUser } from '../api/tiktok.js';
import { icon } from './icons.js';
import { openOverlay } from './overlay.js';
import { toast } from './toast.js';

const LOGIN_URL = 'https://www.tiktok.com/login';

export async function currentAccount() {
  const viewer = await getViewer().catch(() => null);
  if (!viewer?.id) return null;
  if (viewer.avatar && viewer.nickname) return viewer;
  const user = viewer.username ? await fetchUser(viewer.username).catch(() => null) : null;
  return { ...viewer, nickname: viewer.nickname || user?.nickname || '', avatar: viewer.avatar || user?.avatarThumb || '' };
}

function accountAvatar(account) {
  const src = account.avatar || account.avatarUrl;
  const img = src ? h('img', { src, alt: '', referrerpolicy: 'no-referrer' }) : null;
  if (img && account.avatar && account.avatarUrl) {
    img.addEventListener('error', () => { if (img.src !== account.avatarUrl) img.src = account.avatarUrl; }, { once: true });
  }
  return h('span', { class: 'ttp-avatar' }, img);
}

let open = null;

export async function openAccountSwitcher() {
  if (open) return;

  const { root, close } = openOverlay({ className: 'ttp-accounts', onClose: () => { open = null; } });
  open = close;

  const list = h('div', { class: 'ttp-account-list' }, h('div', { class: 'ttp-muted ttp-help' }, t('LOADING')));
  const addButton = h('button', { class: 'ttp-button ttp-primary ttp-account-add', type: 'button' }, icon('userPlus', { size: 16 }), t('ACCOUNT_ADD'));

  root.append(h('div', { class: 'ttp-account-sheet ttp-glass' },
    h('div', { class: 'ttp-sheet-header' },
      h('div', { class: 'ttp-sheet-title' }, h('strong', {}, t('ACCOUNTS_TITLE'))),
      h('button', { class: 'ttp-tool', type: 'button', title: t('CLOSE'), on: { click: close } }, icon('close', { size: 18 }))
    ),
    list,
    addButton,
    h('p', { class: 'ttp-help ttp-muted ttp-account-help' }, t('ACCOUNTS_HELP'))
  ));

  let busy = false;
  const run = async (task) => {
    if (busy) return;
    busy = true;
    root.classList.add('ttp-busy');
    try {
      await task();
    } catch (error) {
      logger.error('Account switch', error);
      toast.error(error);
      busy = false;
      root.classList.remove('ttp-busy');
    }
  };

  const viewer = await currentAccount();

  const switchTo = (account) => run(async () => {
    toast(t('ACCOUNT_SWITCHING', { username: account.username }), { type: 'progress', duration: 8000 });
    const { login } = await sendBackground({ action: 'accountSwitch', id: account.id, viewer });
    if (login) {
      toast(t('ACCOUNT_LOGIN_TOAST', { username: account.username }), { duration: 6000 });
      location.assign(LOGIN_URL);
    } else {
      location.reload();
    }
  });

  const remove = async (account) => {
    if (!confirm(t('ACCOUNT_REMOVE_CONFIRM', { username: account.username }))) return;
    const { accounts } = await sendBackground({ action: 'accountRemove', id: account.id });
    render(accounts);
  };

  addButton.addEventListener('click', () => run(async () => {
    await sendBackground({ action: 'accountAdd', viewer });
    location.assign(LOGIN_URL);
  }));

  function row(account) {
    const isCurrent = account.id === viewer?.id;
    const status = isCurrent
      ? h('span', { class: 'ttp-chip ttp-chip--cyan' }, icon('check', { size: 12 }), t('ACCOUNT_CURRENT'))
      : account.expired ? h('span', { class: 'ttp-chip ttp-chip--orange' }, t('ACCOUNT_EXPIRED')) : null;

    return h('div', {
      class: ['ttp-account-row', isCurrent && 'ttp-on'],
      role: 'button',
      tabindex: isCurrent ? '-1' : '0',
      on: {
        click: () => { if (!isCurrent) switchTo(account); },
        keydown: (e) => { if (!isCurrent && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); switchTo(account); } }
      }
    },
      accountAvatar(account),
      h('div', { class: 'ttp-account-text' },
        h('strong', {}, account.nickname || account.username),
        h('span', { class: 'ttp-muted' }, `@${account.username}`)
      ),
      status,
      isCurrent ? null : h('button', {
        class: 'ttp-tool ttp-account-remove',
        type: 'button',
        title: t('ACCOUNT_REMOVE'),
        on: { click: (e) => { e.stopPropagation(); remove(account).catch(error => toast.error(error)); } }
      }, icon('trash', { size: 16 }))
    );
  }

  function render(accounts) {
    clear(list, accounts.length
      ? accounts.map(row)
      : h('div', { class: 'ttp-muted ttp-help' }, t('ACCOUNTS_EMPTY')));
  }

  try {
    if (viewer) await sendBackground({ action: 'accountSeen', viewer });
    const { accounts } = await sendBackground({ action: 'accountList' });
    render(accounts);
  } catch (error) {
    logger.error('Accounts', error);
    toast.error(error);
  }
}
