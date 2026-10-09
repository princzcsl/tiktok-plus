# TikTok+

A Chrome extension that adds a few things I was missing on TikTok: downloading videos without the watermark, watching stories without showing up in the viewers list, HD profile pictures, and keeping track of who I follow.

It runs entirely in your browser with your own TikTok session. No server, no third-party site, no build step.

## Install

1. Open `chrome://extensions` and turn on Developer mode
2. Click "Load unpacked" and pick this folder
3. Reload your TikTok tabs

## What it does

**Downloads.** A download button sits in the action bar under "Share". Its menu shows when the post was published and lets you grab the video without watermark (best quality by default, H.264 available in the settings), the photos of a carousel (the one on screen, all of them, or one you pick), the thumbnail, the sound as MP3, or a full-resolution capture of the current frame.

Thumbnails on profiles and search pages get a small download button on hover. On a profile, "Select" lets you tick posts one by one or select everything and download it in one go.

Files are named `username_id`, for example `username_7412345678901234567.mp4`. By default Chrome asks where to save them and remembers the last folder; you can switch to saving straight into `Downloads/TikTok+/`.

**Stories without being seen.** The "Stories" button on a profile opens the stories in TikTok+'s own player, so TikTok's player is never opened and no view is recorded. You can download one story or all of them. The regular story player also gets a download button next to "Share" (that one does count as a view).

**HD profile pictures.** Hover the center of a profile picture, or use the "HD picture" button, to open it in 1080×1080 with zoom.

**IDs.** Click the @ on a profile to copy the account's permanent ID or mark it. Marked accounts are found again even after they change their @, and you get a notification when that happens.

**Following history.** The extension icon opens a panel listing the accounts you followed or unfollowed, deleted accounts and @ changes. It syncs automatically once a day while TikTok is open, or manually (once per hour at most).

**Small extras.** Exact posting date under each description, playback speed from 0.5× to 2×, and keyboard shortcuts: D to download, A for the sound, X to capture the frame (changeable in the settings). Alt+Shift+T opens the panel.

## How it works

TikTok already loads everything it shows. `page-hook.js` runs in the page and reads those responses as they arrive, so most actions don't need any extra request. When something is missing, the request is sent from the page itself and TikTok's own code signs it.

Video files come from TikTok's CDN, which expects a `tiktok.com` referer. A `declarativeNetRequest` rule adds it, only for requests made by the extension. If a link has expired, the post is fetched again.

The following sync goes slowly on purpose (30 accounts per page, a pause between pages) and ignores incomplete lists so it never reports fake unfollows. `rules/ghost.json` also blocks story "seen" requests as an extra safety net.

```
page-hook.js      reads TikTok's responses, sends signed requests
content.js        loads modules/main.js
background.js     downloads, badge, extension icon
rules/            story view blocking
_locales/         extension name and description (en, fr)
modules/
  core/           dom helpers, i18n, router, storage, theme
  api/            TikTok data and requests
  services/       downloads, saving, IDs, following sync
  ui/             menus, toasts, viewers, panel
  features/       buttons added to TikTok's pages
```

The interface is available in English and French, depending on your browser language.

## Disclaimer

TikTok+ is an independent project, not affiliated with or endorsed by TikTok or ByteDance. Use it in line with TikTok's Terms of Service and respect creators: only download what you're allowed to keep.

## License

[MIT](LICENSE)
