# TikTok+

Chrome extension (Manifest V3) that adds tools to TikTok. Everything runs locally with your own TikTok session: no third-party website, no build step.

## Installation

1. Open `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Reload your TikTok tabs

## Features

- **Videos**: download button in the action bar (For You feed, video page, post opened from a profile). The menu offers:
  - **HD video without watermark**: best H.264 version (plays everywhere). The watermarked version is only used as a last resort.
  - **All photos** / **View photos**: for photo posts (carousels), with zoom.
  - **Thumbnail**: the first frame loaded (original video cover, or first photo).
- **Ghost mode stories**: **Stories** button under a profile's username. Stories are read through the list API and shown in the TikTok+ player. TikTok's native player is never opened, so no view is sent. Controls: ← / → to navigate, space to pause, M to mute. You can download the story or its thumbnail.
- **HD profile picture** (profiles only): a small magnifier badge in the center of the avatar (or the **HD picture** button) opens it in 1080×1080. The rest of the avatar keeps TikTok's normal click (opening the story). Mouse wheel to zoom around the cursor, double-click for ×2.5, drag to pan.

**Save location asked on every download**: the native picker reopens the last folder used. For several photos, the folder is asked only once.

## How it works

- **No request on page load.** `page-hook.js` (MAIN world) reads the responses TikTok already receives (`/api/...` and the `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON). In most cases, the menu opens without any extra request.
- **Requests signed by TikTok.** If some data is missing, the `/api/` request is sent from the page, and TikTok's own SDK adds its signatures (X-Bogus…). As a fallback, the extension reads the JSON embedded in the HTML page.
- **Downloads.** The file is fetched from the page first; otherwise through the service worker, because the CDN requires a `tiktok.com` Referer. A session `declarativeNetRequest` rule adds it, only for the extension's own requests.
- **Reinforced ghost mode.** `rules/ghost.json` blocks, as a precaution, any TikTok request whose path contains `story` and `view` / `seen` / `read` / `mark`. "Story" requests other than reading are also logged in the console (`[TikTok+] story request: …`), which helps refine the rule if TikTok changes its endpoint.

## Structure

```
page-hook.js          MAIN world: reads TikTok's responses + signed request bridge
content.js            classic loader -> import('modules/main.js')
background.js         downloads (CDN Referer), icon click
rules/ghost.json      blocks story view receipts
modules/
  main.js             feature routing + DOM observer
  core/               dom, i18n (fr/en), logger, router, runtime, theme
  api/                normalize (TikTok structures), pageData (cache), tiktok (requests)
  services/           downloads, save (location picker)
  ui/                 icons, toast, menu, overlay, imageViewer (zoom), storyViewer, avatar
  features/           videos (action bar), profile (avatar + buttons)
```
