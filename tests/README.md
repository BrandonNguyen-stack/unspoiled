# Tests

End-to-end tests that load the unpacked extension into Playwright's Chromium and run it against seeded copies of X, YouTube and TikTok.

```bash
npm install
npm run test:setup   # downloads Playwright's Chromium, once
npm test             # headless
npm run test:headed  # watch it in a visible browser
```

## How it stays deterministic

- **Seeded sites:** requests to `x.com`, `youtube.com` and `tiktok.com` are answered from `tests/sites/<host>/<path>.html`. The content script injects on the real URL but always sees the same DOM. To cover a new page, add a file (for example `www.youtube.com/results.html` for `/results`) and give each post a `data-fixture` name to find it by.
- **Mocked classifier:** the classify API never gets called. `spoilerPattern` in [fixtures.js](fixtures.js) decides the verdicts, and `apiCalls` records every request. Override it per test with `test.use({ spoilerPattern: /.../ })`.
- **Seeded storage:** `seedStorage({ blocklist: [...] })` writes `chrome.storage.local` through the extension's service worker before a page loads (or while it's open, to test live blocklist changes). `readStorage` reads it back.
- **No network:** any other http(s) request is aborted.

The tests use Playwright's Chromium, not Google Chrome, because Chrome 137+ ignores `--load-extension`.
