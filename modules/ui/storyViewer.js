import { h, clear } from '../core/dom.js';
import { t, errorMessage, timeAgo } from '../core/i18n.js';
import { fetchUser, fetchStories } from '../api/tiktok.js';
import { downloadMedia, downloadThumbnail, downloadItem, openBatch } from '../services/downloads.js';
import { toast } from './toast.js';
import { logger } from '../core/logger.js';
import { icon } from './icons.js';
import { openOverlay } from './overlay.js';
import { toolbarButton } from './imageViewer.js';
import { runDownload } from './actions.js';
import { openAvatar } from './avatar.js';

const PHOTO_DURATION = 6000;
let muted = false;

export function openStoryViewer(username) {
  let items = [];
  let index = 0;
  let paused = false;
  let media = null;
  let photoTimer = null;

  const { root, close } = openOverlay({
    className: 'ttp-story-viewer',
    onClose: stopPhotoTimer,
    onKey: (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      } else if (e.key.toLowerCase() === 'm') toggleMute();
    }
  });

  const progress = h('div', { class: 'ttp-story-progress' });
  const avatar = h('img', { class: 'ttp-story-avatar', alt: '', title: t('ZOOM_PP_HINT') });
  const name = h('strong', { class: 'ttp-story-name' }, `@${username}`);
  const time = h('span', { class: 'ttp-story-time' });
  const ghost = h('span', { class: 'ttp-story-ghost', title: t('STORIES_HINT') }, icon('eyeOff', { size: 14 }), t('GHOST'));

  const pauseButton = toolbarButton('pause', t('PAUSE'), () => togglePause());
  const muteButton = toolbarButton(muted ? 'volumeOff' : 'volume', muted ? t('UNMUTE') : t('MUTE'), () => toggleMute());

  const header = h('div', { class: 'ttp-story-header' },
    h('button', { class: 'ttp-story-user', type: 'button', on: { click: () => openAvatar(username) } },
      avatar,
      h('span', { class: 'ttp-story-user-text' }, name, time)
    ),
    ghost,
    h('div', { class: 'ttp-story-tools' },
      pauseButton,
      muteButton,
      toolbarButton('download', t('DOWNLOAD'), () => items[index] && runDownload(() => downloadMedia(items[index]))),
      toolbarButton('image', t('MENU_THUMB'), () => items[index] && runDownload(() => downloadThumbnail(items[index]), { thumbnail: true })),
      toolbarButton('downloadAll', t('STORIES_DOWNLOAD_ALL'), () => downloadAllStories()),
      toolbarButton('close', t('CLOSE'), close)
    )
  );

  const stage = h('div', { class: 'ttp-story-stage' }, h('span', { class: 'ttp-spinner ttp-spinner--lg' }));
  const tapPrev = h('button', { class: 'ttp-story-tap ttp-story-tap--prev', type: 'button', 'aria-label': t('PREVIOUS'), on: { click: () => go(-1) } });
  const tapNext = h('button', { class: 'ttp-story-tap ttp-story-tap--next', type: 'button', 'aria-label': t('NEXT'), on: { click: () => go(1) } });
  const caption = h('div', { class: 'ttp-story-caption' });

  const card = h('div', { class: 'ttp-story-card' }, stage, progress, header, tapPrev, tapNext, caption);
  const prevButton = h('button', { class: 'ttp-nav ttp-nav--prev', type: 'button', 'aria-label': t('PREVIOUS'), on: { click: () => go(-1) } }, icon('left', { size: 22 }));
  const nextButton = h('button', { class: 'ttp-nav ttp-nav--next', type: 'button', 'aria-label': t('NEXT'), on: { click: () => go(1) } }, icon('right', { size: 22 }));
  root.append(card, prevButton, nextButton);

  stage.addEventListener('click', () => togglePause());

  function renderProgress() {
    clear(progress, items.map((_, i) => h('div', { class: ['ttp-story-segment', i < index && 'ttp-done'] }, h('div', { class: 'ttp-story-fill' }))));
  }

  function setFill(ratio) {
    progress.children[index]?.firstChild.style.setProperty('--ttp-fill', `${Math.min(1, Math.max(0, ratio)) * 100}%`);
  }

  function stopPhotoTimer() {
    if (photoTimer) cancelAnimationFrame(photoTimer.raf);
    photoTimer = null;
  }

  function startPhotoTimer(elapsed = 0) {
    stopPhotoTimer();
    const timer = { start: performance.now() - elapsed, elapsed, raf: 0 };
    const tick = (now) => {
      timer.elapsed = now - timer.start;
      setFill(timer.elapsed / PHOTO_DURATION);
      if (timer.elapsed >= PHOTO_DURATION) return go(1, { auto: true });
      timer.raf = requestAnimationFrame(tick);
    };
    timer.raf = requestAnimationFrame(tick);
    photoTimer = timer;
  }

  function togglePause(force) {
    paused = force ?? !paused;
    pauseButton.replaceChildren(icon(paused ? 'play' : 'pause', { size: 20 }));
    pauseButton.title = paused ? t('PLAY') : t('PAUSE');
    card.classList.toggle('ttp-paused', paused);

    if (media instanceof HTMLVideoElement) {
      if (paused) media.pause();
      else media.play().catch(() => {});
    } else if (media) {
      if (paused) {
        const elapsed = photoTimer?.elapsed || 0;
        stopPhotoTimer();
        photoTimer = { elapsed, raf: 0 };
      } else {
        startPhotoTimer(photoTimer?.elapsed || 0);
      }
    }
  }

  function toggleMute() {
    muted = !muted;
    if (media instanceof HTMLVideoElement) media.muted = muted;
    muteButton.replaceChildren(icon(muted ? 'volumeOff' : 'volume', { size: 20 }));
    muteButton.title = muted ? t('UNMUTE') : t('MUTE');
  }

  function failed() {
    clear(stage, h('div', { class: 'ttp-empty' }, t('ERROR_LOADING')));
  }

  function show(nextIndex) {
    stopPhotoTimer();
    media?.pause?.();
    index = nextIndex;
    const item = items[index];

    renderProgress();
    time.textContent = timeAgo(item.createTime);
    caption.textContent = item.desc || '';
    caption.hidden = !item.desc;
    prevButton.disabled = index === 0;
    nextButton.disabled = index === items.length - 1;

    if (item.type === 'video') {
      const urls = [...item.video.compat.urls];
      if (!urls.length) return failed();
      const video = h('video', {
        class: 'ttp-story-media',
        playsInline: true,
        autoplay: true,
        preload: 'auto',
        poster: item.coverUrls[0] || undefined,
        on: {
          timeupdate: () => video.duration && setFill(video.currentTime / video.duration),
          ended: () => go(1, { auto: true }),
          error: () => (urls.length ? (video.src = urls.shift()) : failed())
        }
      });
      video.muted = muted;
      video.src = urls.shift();
      media = video;
      clear(stage, video);
      if (!paused) video.play().catch(() => {});
      else video.pause();
    } else {
      const urls = [...(item.images[0]?.urls || item.coverUrls)];
      if (!urls.length) return failed();
      const img = h('img', {
        class: 'ttp-story-media',
        alt: '',
        draggable: false,
        on: {
          load: () => (paused ? (photoTimer = { elapsed: 0, raf: 0 }) : startPhotoTimer()),
          error: () => (urls.length ? (img.src = urls.shift()) : failed())
        }
      });
      img.src = urls.shift();
      media = img;
      clear(stage, img);
    }
  }

  function go(step, { auto = false } = {}) {
    if (!items.length) return;
    const next = index + step;
    if (next < 0) return show(0);
    if (next >= items.length) {
      if (auto) {
        setFill(1);
        togglePause(true);
      }
      return;
    }
    show(next);
  }

  async function downloadAllStories() {
    if (!items.length) return;
    const wasPaused = paused;
    togglePause(true);

    let dir;
    try {
      dir = await openBatch();
    } catch (error) {
      if (error.name !== 'AbortError') toast.error(error);
      if (!wasPaused) togglePause(false);
      return;
    }

    const progress = toast.progress(t('DL_PROGRESS', { done: 0, total: items.length }));
    let failed = 0;
    let firstError = null;
    for (const [i, item] of items.entries()) {
      try {
        await downloadItem(item, dir);
      } catch (error) {
        failed++;
        firstError ??= error;
        logger.warning(`Story ${item.id} impossible : ${error?.message || error}`, error);
      }
      progress.update(t('DL_PROGRESS', { done: i + 1, total: items.length }), (i + 1) / items.length);
    }
    const done = items.length - failed;
    const message = dir ? t('DL_ALL_SAVED_AT', { n: done, where: dir.name }) : t('DL_ALL_DONE', { n: done });
    if (failed) progress.fail(`${message} · ${t('N_FAILED', { n: failed })} (${errorMessage(firstError)})`);
    else progress.done(message);
  }

  (async () => {
    const user = await fetchUser(username);
    avatar.src = user.avatarThumb || user.avatarHD;
    name.textContent = `@${user.username || username}`;

    items = await fetchStories(user);
    if (!items.length) {
      clear(stage, h('div', { class: 'ttp-empty' }, t('NO_STORIES')));
      prevButton.hidden = nextButton.hidden = true;
      return;
    }
    show(0);
  })().catch(error => clear(stage, h('div', { class: 'ttp-empty' }, errorMessage(error))));

  return { close };
}
