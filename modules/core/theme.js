function parseRgb(value) {
  const parts = String(value || '').match(/[\d.]+/g)?.map(Number);
  if (!parts || parts.length < 3) return null;
  if (parts.length >= 4 && parts[3] === 0) return null;
  return parts.slice(0, 3);
}

const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export function detectTheme() {
  const candidates = [
    document.body && getComputedStyle(document.body).backgroundColor,
    getComputedStyle(document.documentElement).backgroundColor
  ];

  for (const candidate of candidates) {
    const rgb = parseRgb(candidate);
    if (rgb) return luminance(rgb) < 0.5 ? 'dark' : 'light';
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply() {
  const theme = detectTheme();
  if (document.documentElement.dataset.ttpTheme !== theme) document.documentElement.dataset.ttpTheme = theme;
}

export function watchTheme() {
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
  setInterval(apply, 2000);
}
