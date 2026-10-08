const STRINGS = {
  fr: {
    LOADING: 'Chargement…',
    CLOSE: 'Fermer',
    PREVIOUS: 'Précédent',
    NEXT: 'Suivant',
    DOWNLOAD: 'Télécharger',
    DL_BTN: 'TikTok+ : télécharger',
    DL_STARTED: 'Téléchargement lancé',
    DL_THUMB_STARTED: 'Miniature téléchargée',
    DL_PROGRESS: 'Téléchargement {done}/{total}',
    DL_ALL_DONE: '{n} fichiers téléchargés',
    DL_SAVED_AT: 'Enregistré : {where}',
    DL_ALL_SAVED_AT: '{n} fichiers enregistrés dans {where}',
    CANCELLED: 'Annulé',
    MENU_VIDEO: 'Vidéo HD sans filigrane',
    MENU_PHOTOS: 'Toutes les photos',
    MENU_PHOTO_VIEW: 'Voir les photos',
    MENU_THUMB: 'Miniature',
    MENU_AVATAR: 'Photo de profil HD',
    ITEM_NOT_FOUND: 'Publication introuvable',
    STORIES_BTN: 'Stories',
    STORIES_HINT: 'Voir les stories sans laisser de vu',
    NO_STORIES: 'Aucune story en cours',
    GHOST: 'Mode fantôme',
    ZOOM_PP: 'Photo HD',
    ZOOM_PP_HINT: 'Photo de profil en HD',
    TOGGLE_SHAPE: 'Rond / carré',
    MUTE: 'Couper le son',
    UNMUTE: 'Activer le son',
    PAUSE: 'Pause',
    PLAY: 'Lecture',
    ZOOM_HINT: 'Molette : zoom · double-clic : ×2.5 · glisser : déplacer',
    ERROR_LOADING: 'Impossible de charger le média',
    ERR_EXTENSION_RELOADED: 'Extension mise à jour : recharge la page',
    ERR_NOT_FOUND: 'Introuvable',
    ERR_NO_URL: 'Aucun fichier disponible pour ce média',
    ERR_TIMEOUT: 'TikTok ne répond pas, réessaie',
    ERR_HTTP: 'Erreur TikTok (HTTP {status})',
    ERR_GENERIC: 'Erreur : {message}'
  },
  en: {
    LOADING: 'Loading…',
    CLOSE: 'Close',
    PREVIOUS: 'Previous',
    NEXT: 'Next',
    DOWNLOAD: 'Download',
    DL_BTN: 'TikTok+: download',
    DL_STARTED: 'Download started',
    DL_THUMB_STARTED: 'Thumbnail downloaded',
    DL_PROGRESS: 'Downloading {done}/{total}',
    DL_ALL_DONE: '{n} files downloaded',
    DL_SAVED_AT: 'Saved: {where}',
    DL_ALL_SAVED_AT: '{n} files saved to {where}',
    CANCELLED: 'Cancelled',
    MENU_VIDEO: 'HD video, no watermark',
    MENU_PHOTOS: 'All photos',
    MENU_PHOTO_VIEW: 'View photos',
    MENU_THUMB: 'Thumbnail',
    MENU_AVATAR: 'HD profile picture',
    ITEM_NOT_FOUND: 'Post not found',
    STORIES_BTN: 'Stories',
    STORIES_HINT: 'Watch stories without being seen',
    NO_STORIES: 'No active story',
    GHOST: 'Ghost mode',
    ZOOM_PP: 'HD picture',
    ZOOM_PP_HINT: 'HD profile picture',
    TOGGLE_SHAPE: 'Round / square',
    MUTE: 'Mute',
    UNMUTE: 'Unmute',
    PAUSE: 'Pause',
    PLAY: 'Play',
    ZOOM_HINT: 'Wheel: zoom · double-click: ×2.5 · drag: pan',
    ERROR_LOADING: 'Unable to load media',
    ERR_EXTENSION_RELOADED: 'Extension updated: reload the page',
    ERR_NOT_FOUND: 'Not found',
    ERR_NO_URL: 'No file available for this media',
    ERR_TIMEOUT: 'TikTok is not responding, try again',
    ERR_HTTP: 'TikTok error (HTTP {status})',
    ERR_GENERIC: 'Error: {message}'
  }
};

export const LANG = /^fr\b/i.test(navigator.language || '') ? 'fr' : 'en';

export function t(key, vars = {}) {
  const template = STRINGS[LANG][key] ?? STRINGS.fr[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

export function errorMessage(error) {
  const code = error?.code || error?.message || String(error);
  if (code === 'extension_reloaded') return t('ERR_EXTENSION_RELOADED');
  if (code === 'not_found') return t('ERR_NOT_FOUND');
  if (code === 'no_url') return t('ERR_NO_URL');
  if (code === 'timeout') return t('ERR_TIMEOUT');
  if (/^http_\d+$/.test(code)) return t('ERR_HTTP', { status: code.slice(5) });
  return t('ERR_GENERIC', { message: code });
}

const relative = new Intl.RelativeTimeFormat(LANG, { numeric: 'auto' });

export function timeAgo(seconds) {
  if (!seconds) return '';
  const diff = Math.round(seconds - Date.now() / 1000);
  const abs = Math.abs(diff);
  if (abs < 60) return relative.format(diff, 'second');
  if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(diff / 3600), 'hour');
  return relative.format(Math.round(diff / 86400), 'day');
}
