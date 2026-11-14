// Playwright fixtures that run Unspoiled in a real Chromium against seeded copies of the sites.
//
// - `context`: a persistent Chromium profile with the unpacked extension loaded. Branded Google Chrome
//   (137+) ignores --load-extension, so this uses Playwright's own Chromium build.
// - Every request to x.com / youtube.com / tiktok.com is answered from tests/sites/<host>/<path>.html,
//   so the content script injects on the real URL but sees the same DOM on every run.
// - The classify API is mocked: `spoilerPattern` decides which posts come back as spoilers, and
//   `apiCalls` records every request so tests can assert what was (and wasn't) sent.
// - Any other http(s) request is aborted, so nothing reaches the network.
const path = require("node:path");
const fs = require("node:fs");
const { test: base, expect } = require("@playwright/test");

const EXTENSION_PATH = path.resolve(__dirname, "..");
const SITES_DIR = path.join(__dirname, "sites");
const API_URL = "https://unspoiled-api-sable.vercel.app/api/classify";
const SEEDED_HOSTS = ["x.com", "twitter.com", "www.youtube.com", "www.tiktok.com"];

// The default mock classifier: a post is a spoiler when its text describes a plot event.
const DEFAULT_SPOILER_PATTERN = /\b(dies|died|killed|death|ending|finale|reveal(?:s|ed)?|twist)\b/i;

function siteFile(url) {
  const { hostname, pathname } = new URL(url);
  const host = hostname === "twitter.com" ? "x.com" : hostname;
  const name = pathname.replace(/^\/+|\/+$/g, "") || "index";
  return path.join(SITES_DIR, host, `${name}.html`);
}

const test = base.extend({
  // Override per test with test.use({ spoilerPattern: /.../ }).
  spoilerPattern: [DEFAULT_SPOILER_PATTERN, { option: true }],

  apiCalls: async ({}, use) => {
    await use([]);
  },

  context: async ({ spoilerPattern, apiCalls }, use, testInfo) => {
    const { chromium } = require("@playwright/test");
    const userDataDir = testInfo.outputPath("profile");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: !process.env.HEADED,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    // Routes are tried newest first, so the catch-all goes in before the specific ones.
    await context.route(/^https?:\/\//, (route) => route.abort("blockedbyclient"));

    for (const host of SEEDED_HOSTS) {
      await context.route(`https://${host}/**`, (route) => {
        const file = siteFile(route.request().url());
        if (route.request().resourceType() !== "document" || !fs.existsSync(file)) {
          return route.fulfill({ status: 404, body: "" });
        }
        return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", path: file });
      });
    }

    await context.route(API_URL, async (route) => {
      const body = route.request().postDataJSON();
      apiCalls.push(body);
      const results = body.posts.map((p) => ({ id: p.id, spoiler: spoilerPattern.test(p.text) }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results }) });
    });

    await use(context);
    await context.close();
  },

  // The extension's service worker: used to read and write chrome.storage.
  extensionWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(worker);
  },

  extensionId: async ({ extensionWorker }, use) => {
    await use(new URL(extensionWorker.url()).host);
  },

  // Seeds chrome.storage.local before any page loads, e.g. await seedStorage({ blocklist: [...] }).
  seedStorage: async ({ extensionWorker }, use) => {
    await use((items) => extensionWorker.evaluate((i) => chrome.storage.local.set(i), items));
  },

  readStorage: async ({ extensionWorker }, use) => {
    await use((keys) => extensionWorker.evaluate((k) => chrome.storage.local.get(k), keys));
  },
});

// Shows to put on the blocklist, shaped like the entries the popup stores.
const SHOWS = {
  severance: { id: 95396, title: "Severance", year: "2022", type: "tv" },
  andor: { id: 83867, title: "Andor", year: "2022", type: "tv" },
};

module.exports = { test, expect, SHOWS, API_URL };
