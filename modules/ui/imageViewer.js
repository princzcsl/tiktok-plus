import { h, clear } from '../core/dom.js';
import { t, errorMessage } from '../core/i18n.js';
import { icon } from './icons.js';
import { openOverlay } from './overlay.js';
import { toast } from './toast.js';

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const DOUBLE_CLICK_SCALE = 2.5;

export function toolbarButton(iconName, label, onClick) {
  return h('button', {
    class: 'ttp-tool',
    type: 'button',
    title: label,
    'aria-label': label,
    on: {
      click: async (e) => {
        e.stopPropagation();
        try {
          await onClick(e);
        } catch (error) {
          toast.error(error);
        }
      }
    }
  }, icon(iconName, { size: 20 }));
}

export function openImageViewer({ title, subtitle = '', load, startIndex = 0, round = null, actions = [] }) {
  let images = [];
  let index = startIndex;
  let isRound = Boolean(round);
  let view = { scale: 1, x: 0, y: 0 };
  let img = null;

  const { root, close } = openOverlay({
    className: 'ttp-image-viewer',
    onKey: (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    }
  });

  const titleEl = h('strong', {}, title);
  const subtitleEl = h('span', {}, subtitle);
  const meta = h('span', { class: 'ttp-viewer-meta' });
  const counter = h('span', { class: 'ttp-viewer-counter' });
  const stage = h('div', { class: 'ttp-viewer-stage' }, h('span', { class: 'ttp-spinner ttp-spinner--lg' }));

  const shapeButton = round === null ? null : toolbarButton(isRound ? 'square' : 'circle', t('TOGGLE_SHAPE'), () => {
    isRound = !isRound;
    img?.classList.toggle('ttp-round', isRound);
    shapeButton.replaceChildren(icon(isRound ? 'square' : 'circle', { size: 20 }));
  });

  const prevButton = h('button', { class: 'ttp-nav ttp-nav--prev', type: 'button', 'aria-label': t('PREVIOUS'), on: { click: (e) => { e.stopPropagation(); go(-1); } } }, icon('left', { size: 22 }));
  const nextButton = h('button', { class: 'ttp-nav ttp-nav--next', type: 'button', 'aria-label': t('NEXT'), on: { click: (e) => { e.stopPropagation(); go(1); } } }, icon('right', { size: 22 }));

  const toolbar = h('div', { class: 'ttp-viewer-toolbar ttp-glass' },
    shapeButton,
    toolbarButton('zoomIn', t('ZOOM_HINT'), () => zoomAt(view.scale > 1 ? 1 : DOUBLE_CLICK_SCALE)),
    actions.filter(Boolean).map(a => toolbarButton(a.icon, a.label, () => a.onClick(index))),
    toolbarButton('close', t('CLOSE'), close)
  );

  const caption = h('div', { class: 'ttp-viewer-caption' }, titleEl, subtitleEl, h('span', { class: 'ttp-viewer-info' }, counter, meta));

  root.append(toolbar, stage, prevButton, nextButton, caption);

  function applyView() {
    if (!img) return;
    img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    img.classList.toggle('ttp-zoomed', view.scale > 1);
    updateMeta();
  }

  function updateMeta() {
    if (!img?.naturalWidth) return;
    const zoom = view.scale > 1 ? ` · ${Math.round(view.scale * 100)} %` : '';
    meta.textContent = `${img.naturalWidth} × ${img.naturalHeight}px${zoom}`;
  }

  function zoomAt(nextScale, clientX, clientY) {
    if (!img) return;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    const rect = img.getBoundingClientRect();
    const dx = clientX === undefined ? 0 : clientX - (rect.left + rect.width / 2);
    const dy = clientY === undefined ? 0 : clientY - (rect.top + rect.height / 2);
    const ratio = scale / view.scale;

    view = scale === 1
      ? { scale: 1, x: 0, y: 0 }
      : { scale, x: view.x + dx * (1 - ratio), y: view.y + dy * (1 - ratio) };
    applyView();
  }

  stage.addEventListener('wheel', (e) => {
    if (!img) return;
    e.preventDefault();
    zoomAt(view.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY);
  }, { passive: false });

  stage.addEventListener('dblclick', (e) => {
    if (e.target !== img) return;
    zoomAt(view.scale > 1 ? 1 : DOUBLE_CLICK_SCALE, e.clientX, e.clientY);
  });

  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target !== img || view.scale <= 1) return;
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX - view.x, y: e.clientY - view.y };
    img.setPointerCapture(e.pointerId);
    img.classList.add('ttp-dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    view.x = e.clientX - drag.x;
    view.y = e.clientY - drag.y;
    applyView();
  });
  const endDrag = () => {
    drag = null;
    img?.classList.remove('ttp-dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('click', (e) => {
    if (e.target === stage) close();
  });

  function show(nextIndex) {
    index = (nextIndex + images.length) % images.length;
    view = { scale: 1, x: 0, y: 0 };
    meta.textContent = '';
    counter.textContent = images.length > 1 ? `${index + 1}/${images.length} · ` : '';
    prevButton.hidden = nextButton.hidden = images.length < 2;

    const urls = [...images[index].urls];
    const current = h('img', {
      class: ['ttp-viewer-img', isRound && 'ttp-round'],
      alt: title,
      draggable: false,
      on: {
        load: () => {
          current.classList.add('ttp-loaded');
          updateMeta();
        },
        error: () => {
          if (urls.length) current.src = urls.shift();
          else clear(stage, h('div', { class: 'ttp-empty' }, t('ERROR_LOADING')));
        }
      }
    });
    current.src = urls.shift();
    img = current;
    clear(stage, current);
  }

  function go(step) {
    if (images.length > 1) show(index + step);
  }

  Promise.resolve()
    .then(load)
    .then(result => {
      images = (result.images || []).filter(image => image.urls?.length);
      if (result.title) titleEl.textContent = result.title;
      if (result.subtitle) subtitleEl.textContent = result.subtitle;
      if (!images.length) throw new Error('no_url');
      show(Math.min(index, images.length - 1));
    })
    .catch(error => clear(stage, h('div', { class: 'ttp-empty' }, errorMessage(error))));

  return { close };
}
