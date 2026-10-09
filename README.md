# TikTok+

Chrome extension (Manifest V3) that adds tools to TikTok. Everything runs locally with your own TikTok session: no third-party website, no build step.

## Installation

1. Open `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Reload your TikTok tabs

## Features

### Downloads
- **Download and speed buttons** at the top right of the video (For You feed, opened post), without touching TikTok's bar; in the action bar on pages with a horizontal layout. The menu shows the date, time and duration, then offers:
  - **Video without watermark** in the best resolution (can be switched to H.264 if a player can't read H.265)
  - Photo posts: **Current photo** (the slide on screen, e.g. 3/8), **All photos**, or **Pick a photo…** (zoomable viewer opened on the current slide)
  - **Thumbnail**: the first frame loaded
  - **Sound** as MP3
  - **Capture the current frame**, in full resolution (PNG)
- **Button on thumbnail hover** (profile, search…), opening the same menu.
- **Selection on a profile**: **Select** button, then tick posts one by one or use **Select all**. Thumbnails loaded later while scrolling are ticked too. Videos and photo posts are supported, with a single folder choice for the whole batch.
- **Automatic naming**: `username_id`, e.g. `username_7412345678901234567.mp4`. Photos `_01`, `_02`…; thumbnail `_miniature`; capture `_capture`.
- **Location**: asked every time (last folder remembered), or saved directly to `Downloads/TikTok+/` depending on the settings.

### Keyboard shortcuts
On the post on screen: **D** download · **A** sound · **X** capture. Keys can be changed in the settings. **Alt+Shift+T** opens the panel.

### Playback
- **Playback speed** (0.5× to 2×): button in the action bar, setting remembered.
- **Exact posting date and time** under the description, derived from the ID without any request.

### Ghost mode stories
**Stories** button under a profile's username. Stories are read through the list API and shown in the TikTok+ player, without ever opening the native player: no view is sent. You can download a story, its thumbnail, or **all stories** at once.

In TikTok's **regular story player**, a download button also appears to the left of "Share". It offers the story (video or photo), its thumbnail, the sound, a capture of the current frame, and all of the account's stories.

### HD profile picture
Magnifier badge in the center of a profile's avatar, or **HD picture** button: 1080×1080 with zoom. The rest of the avatar keeps TikTok's normal click.

### IDs
Click the @ on a profile to copy its **permanent ID** or **mark** the account. A marked account is found again even if its @ changes (through its immutable secUid), and a notification appears when a change is detected. The panel offers a search by @, link or ID, and the list of marked accounts with their former @.

### Following tracking
The panel (extension icon) lists the history of the accounts you follow: follows, unfollows, deleted accounts and @ changes.
- **Automatic** sync every 24 h while a TikTok tab is open.
- **Manual** sync, at most once per hour.
- Badge on the icon when there is something new.

## How it works

- **No request on page load.** `page-hook.js` (MAIN world) reads the responses TikTok already receives (`/api/...` and the `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON), including a profile's stories and posts.
- **Requests signed by TikTok.** If some data is missing, the `/api/` request is sent from the page, and TikTok's own SDK adds its signatures (X-Bogus…).
- **Downloads.** The file is fetched from the page, otherwise through the service worker (the CDN requires a `tiktok.com` Referer, added by a `declarativeNetRequest` rule limited to the extension). If a link has expired, the post is reloaded automatically.
- **Careful sync.** Pages of 30 accounts spaced 1.5 to 3 s apart. An incomplete list is ignored so it doesn't create fake unfollows, and auto sync pauses for 2 h if TikTok rate-limits requests.
- **Reinforced ghost mode.** `rules/ghost.json` blocks, as a precaution, TikTok requests whose path contains `story` and `view` / `seen` / `read` / `mark`.

## Structure

```
page-hook.js          MAIN world: reads TikTok's responses + signed request bridge
content.js            classic loader -> import('modules/main.js')
background.js         downloads (CDN Referer), badge, icon -> panel
rules/ghost.json      blocks story view receipts
modules/
  main.js             feature routing + DOM observer
  core/               dom, i18n (fr/en), logger, router, runtime, storage (settings), theme
  api/                normalize (TikTok structures), pageData (cache), tiktok (requests)
  services/           downloads, save (location), ids (marked accounts), sync (following)
  ui/                 icons, toast, menu, overlay, imageViewer, storyViewer, avatar, panel
  features/           videos, tiles (hover + selection), profile, speed, shortcuts
```
