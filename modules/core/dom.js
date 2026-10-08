export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;

    switch (key) {
      case 'class':
        el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
        break;
      case 'style':
        if (typeof value === 'string') el.style.cssText = value;
        else Object.assign(el.style, value);
        break;
      case 'dataset':
        Object.assign(el.dataset, value);
        break;
      case 'on':
        for (const [event, handler] of Object.entries(value)) el.addEventListener(event, handler);
        break;
      case 'html':
        el.innerHTML = value;
        break;
      case 'text':
        el.textContent = value;
        break;
      default:
        if (key in el && typeof value !== 'string') el[key] = value;
        else el.setAttribute(key, value === true ? '' : value);
    }
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  appendChildren(el, children);
  return el;
}

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function stopEvent(e) {
  e.preventDefault();
  e.stopPropagation();
}

export function mediaKey(url) {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return null;
  try {
    const name = new URL(url, location.href).pathname.split('/').pop();
    const key = name?.split('~')[0].replace(/\.[a-z0-9]+$/i, '');
    return key && key.length > 8 ? key : null;
  } catch {
    return null;
  }
}

export function sanitizeFilename(name) {
  return String(name)
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 120);
}
