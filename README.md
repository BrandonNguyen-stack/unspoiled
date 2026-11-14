# Unspoiled

A Chrome extension that hides TV and movie spoilers on X, YouTube and TikTok.

You pick the shows you care about. Unspoiled reads each post as it scrolls into view, asks a classifier whether it gives away plot, and covers the ones that do. One click reveals a post if you want to see it anyway.

## How it works

```
popup ──► chrome.storage.local ──► content script ──► classify API
(pick shows via TMDB search)       (per-site DOM)      (spoiler: true/false)
```

1. **Blocklist.** The popup searches [TMDB](https://www.themoviedb.org/) for a title and saves it to `chrome.storage.local`. The content script listens for storage changes, so adding or removing a show updates open tabs without a reload.
2. **Keyword pre-filter.** Each post's text is checked locally against keywords built from the blocklist titles. Posts that don't mention a blocked show never leave the browser, which keeps most of the feed off the network.
3. **Classification.** Posts that pass the filter are hidden immediately, then sent to a small classify API as `{ posts: [{ id, text }], blocklist }`. It answers `{ results: [{ id, spoiler }] }`. A post about a show isn't always a spoiler ("season 2 starts tonight"), which is why a keyword match alone isn't enough.
4. **Blur.** Spoilers get an overlay naming the reason, with a reveal button. Everything else is shown again. If the API fails, posts are shown rather than left hidden.
5. **Feedback.** A flag on each post reports a missed spoiler, and revealed posts ask whether the call was right. Feedback is stored locally.

The classify API is a separate service and isn't part of this repo.

### Per-site handling

Each site needs its own selectors and its own workarounds, all in [src/content.js](src/content.js):

| Site | Surfaces | Notes |
| --- | --- | --- |
| X / Twitter | Timeline, replies | Posts are keyed by status ID, so a verdict survives X recycling DOM nodes on scroll. |
| YouTube | Home, search, sidebar, comments, Shorts | The Shorts player reuses one element for every video and the URL lags the player, so Shorts are tracked by the player's own video ID and covered before the first frame. |
| TikTok | For You, search, profile grids | Captions load lazily, so cards are watched with an `IntersectionObserver` and polled until the caption arrives. |

## Install

1. Clone the repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the repo folder.
4. Pin Unspoiled, open it, and add a show.

## Tests

End-to-end tests load the unpacked extension into Playwright's Chromium and run it against seeded copies of each site, with the classify API mocked.

```bash
npm install
npm run test:setup
npm test
```

See [tests/README.md](tests/README.md) for how the fixtures keep runs deterministic.

## Project layout

```
manifest.json         Manifest V3 config
src/background.js     Service worker: badge count, first-install welcome page
src/content.js        Post detection, classification, blur UI
src/popup.*           Blocklist manager with TMDB search
src/welcome.html      Onboarding page
tests/                Playwright specs, fixtures and seeded site pages
```

## Debugging

Set `DEBUG = true` at the top of [src/content.js](src/content.js) and reload the extension to log what was scanned, what passed the keyword filter, and what the classifier returned.

## Credits

Title search uses the TMDB API. This product is not endorsed or certified by TMDB.
