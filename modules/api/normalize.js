const isId = (value) => value !== undefined && value !== null && value !== '' && /^\d+$/.test(String(value));

const unique = (list) => [...new Set(list.filter(url => typeof url === 'string' && url.startsWith('https://')))];

export function urlsOf(value) {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  return value.urlList || value.UrlList || value.url_list || [];
}

const sortImageUrls = (urls) => unique(urls).sort((a, b) => Number(!/\.jpe?g/i.test(a)) - Number(!/\.jpe?g/i.test(b)));

function pickVideoUrls(video) {
  const variants = (video.bitrateInfo || [])
    .map(b => ({
      urls: urlsOf(b.PlayAddr),
      h264: /264/.test(String(b.CodecType || '')),
      height: Math.min(b.PlayAddr?.Width || 0, b.PlayAddr?.Height || 0) || 0,
      bitrate: b.Bitrate || 0
    }))
    .filter(v => v.urls.length)
    .sort((a, b) => (Number(b.h264) - Number(a.h264)) || (b.height - a.height) || (b.bitrate - a.bitrate));

  const urls = unique([
    ...variants.flatMap(v => v.urls),
    ...urlsOf(video.playAddr),
    ...urlsOf(video.downloadAddr)
  ]);
  return { urls, quality: variants[0]?.height || Math.min(video.width || 0, video.height || 0) || 0 };
}

function largestZoomCover(zoomCover) {
  if (!zoomCover || typeof zoomCover !== 'object') return [];
  return Object.entries(zoomCover)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([, url]) => url);
}

export function normalizeUser(raw) {
  return {
    id: String(raw.id),
    username: raw.uniqueId || '',
    nickname: raw.nickname || '',
    secUid: raw.secUid || '',
    verified: Boolean(raw.verified),
    avatarHD: urlsOf(raw.avatarLarger)[0] || urlsOf(raw.avatarMedium)[0] || urlsOf(raw.avatarThumb)[0] || '',
    avatarThumb: urlsOf(raw.avatarThumb)[0] || urlsOf(raw.avatarMedium)[0] || urlsOf(raw.avatarLarger)[0] || '',
    hasHD: Boolean(raw.avatarLarger)
  };
}

export function normalizeItem(raw) {
  const author = raw.author && typeof raw.author === 'object' ? raw.author : null;
  const video = raw.video || {};

  const images = (raw.imagePost?.images || [])
    .map(img => ({
      urls: sortImageUrls(urlsOf(img.imageURL || img.displayImage)),
      width: img.imageWidth || 0,
      height: img.imageHeight || 0
    }))
    .filter(img => img.urls.length);

  const isPhoto = images.length > 0;
  const picked = isPhoto ? { urls: [], quality: 0 } : pickVideoUrls(video);

  return {
    id: String(raw.id),
    desc: raw.desc || '',
    createTime: Number(raw.createTime) || 0,
    username: author?.uniqueId || (typeof raw.author === 'string' ? raw.author : '') || '',
    nickname: author?.nickname || '',
    authorId: author?.id ? String(author.id) : (raw.authorId ? String(raw.authorId) : null),
    avatar: author ? normalizeUser(author).avatarThumb : '',
    type: isPhoto ? 'photo' : 'video',
    videoUrls: picked.urls,
    quality: picked.quality,
    width: video.width || 0,
    height: video.height || 0,
    duration: video.duration || 0,
    images,
    coverUrls: unique([
      ...urlsOf(video.originCover),
      ...largestZoomCover(video.zoomCover),
      ...urlsOf(video.cover),
      ...sortImageUrls(urlsOf(raw.imagePost?.cover?.imageURL)),
      ...(images[0]?.urls || [])
    ])
  };
}

export function findRaw(root) {
  const items = new Map();
  const users = new Map();
  const stack = [[root, 0]];

  while (stack.length) {
    const [node, depth] = stack.pop();
    if (!node || typeof node !== 'object' || depth > 40) continue;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push([node[i], depth + 1]);
      continue;
    }

    const isItem = isId(node.id) && (
      (node.video && typeof node.video === 'object' && (node.video.playAddr || node.video.cover || node.video.bitrateInfo)) ||
      (Array.isArray(node.imagePost?.images) && node.imagePost.images.length)
    );
    if (isItem) items.set(String(node.id), node);
    if (typeof node.uniqueId === 'string' && isId(node.id) && (node.avatarLarger || node.avatarMedium || node.avatarThumb)) {
      users.set(String(node.id), node);
    }

    const children = Object.values(node).filter(value => value && typeof value === 'object');
    for (let i = children.length - 1; i >= 0; i--) stack.push([children[i], depth + 1]);
  }

  return { items: [...items.values()], users: [...users.values()] };
}
