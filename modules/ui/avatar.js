import { t } from '../core/i18n.js';
import { fetchUser } from '../api/tiktok.js';
import { downloadAvatar } from '../services/downloads.js';
import { openImageViewer } from './imageViewer.js';
import { runDownload } from './actions.js';

export function openAvatar(username) {
  let user = null;

  return openImageViewer({
    title: `@${username}`,
    round: true,
    load: async () => {
      user = await fetchUser(username);
      return {
        title: `@${user.username || username}`,
        subtitle: user.nickname,
        images: [{ urls: [user.avatarHD, user.avatarThumb].filter(Boolean) }]
      };
    },
    actions: [{
      icon: 'download',
      label: t('DOWNLOAD'),
      onClick: () => user && runDownload(() => downloadAvatar(user))
    }]
  });
}
