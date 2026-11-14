// End-to-end checks of the content script on seeded copies of X, YouTube and TikTok.
// The classify API is mocked (see fixtures.js), so these test the extension's own behavior:
// which posts it sends, and what it does with the verdicts.
const { test, expect, SHOWS } = require("./fixtures");

const post = (page, name) => page.locator(`[data-fixture="${name}"]`);
const sentTexts = (apiCalls) => apiCalls.flatMap((call) => call.posts.map((p) => p.text));

test.describe("X", () => {
  test("blurs a spoiler, leaves a harmless mention, and never sends unrelated posts", async ({ context, seedStorage, apiCalls }) => {
    await seedStorage({ blocklist: [SHOWS.severance] });
    const page = await context.newPage();
    await page.goto("https://x.com/home");

    await expect(post(page, "x-spoiler")).toHaveAttribute("data-unspoiled", "blurred");
    await expect(page.locator(".unspoiled-overlay")).toHaveCount(1);

    const safe = post(page, "x-safe-mention");
    await expect(safe.locator(".unspoiled-flag-btn")).toBeAttached();
    await expect(safe).not.toHaveAttribute("data-unspoiled-preblur", /.*/);
    await expect(safe).not.toHaveAttribute("data-unspoiled", /.*/);

    await expect.poll(() => apiCalls.length).toBe(2);
    expect(sentTexts(apiCalls).sort()).toEqual([
      "Can't believe Mark dies in the Severance finale",
      "Rewatching Severance season 1 this weekend, so good",
    ]);
    expect(apiCalls[0].blocklist).toEqual([SHOWS.severance]);
  });

  test("reveal unblurs the post and asks for feedback", async ({ context, seedStorage, readStorage }) => {
    await seedStorage({ blocklist: [SHOWS.severance] });
    const page = await context.newPage();
    await page.goto("https://x.com/home");

    await page.getByRole("button", { name: "Click to reveal" }).click();
    await expect(post(page, "x-spoiler")).toHaveAttribute("data-unspoiled", "revealed");
    await expect(page.locator(".unspoiled-overlay")).toHaveCount(0);

    await page.getByRole("button", { name: "✓ Was a spoiler" }).click();
    await expect.poll(async () => (await readStorage(["feedback"])).feedback?.[0]?.action).toBe("spoiler");
  });

  test("blurs posts added after the page loads", async ({ context, seedStorage }) => {
    await seedStorage({ blocklist: [SHOWS.severance] });
    const page = await context.newPage();
    await page.goto("https://x.com/home");
    await expect(post(page, "x-spoiler")).toHaveAttribute("data-unspoiled", "blurred");

    await page.evaluate(() => {
      const wrap = document.createElement("div");
      wrap.innerHTML = `<article data-testid="tweet" data-fixture="x-late">
        <a href="/fan/status/2001">@fan</a>
        <div data-testid="tweetText"><span>The Severance twist about Gemma broke me</span></div>
      </article>`;
      document.querySelector("section").appendChild(wrap);
    });
    await expect(post(page, "x-late")).toHaveAttribute("data-unspoiled", "blurred");
  });

  test("adding and removing a show rescans the page", async ({ context, seedStorage }) => {
    await seedStorage({ blocklist: [SHOWS.severance] });
    const page = await context.newPage();
    await page.goto("https://x.com/home");
    await expect(post(page, "x-spoiler")).toHaveAttribute("data-unspoiled", "blurred");
    await expect(post(page, "x-andor")).not.toHaveAttribute("data-unspoiled", /.*/);

    await seedStorage({ blocklist: [SHOWS.severance, SHOWS.andor] });
    await expect(post(page, "x-andor")).toHaveAttribute("data-unspoiled", "blurred");

    await seedStorage({ blocklist: [SHOWS.andor] });
    await expect(post(page, "x-spoiler")).not.toHaveAttribute("data-unspoiled", /.*/);
    await expect(post(page, "x-andor")).toHaveAttribute("data-unspoiled", "blurred");
  });

  test("does nothing with an empty blocklist", async ({ context, apiCalls }) => {
    const page = await context.newPage();
    await page.goto("https://x.com/home");
    await expect(post(page, "x-spoiler")).toBeVisible();
    await page.waitForTimeout(500);
    expect(apiCalls).toHaveLength(0);
    await expect(page.locator("[data-unspoiled]")).toHaveCount(0);
  });

  test("counts blocked spoilers for the toolbar badge", async ({ context, seedStorage, readStorage }) => {
    await seedStorage({ blocklist: [SHOWS.severance] });
    const page = await context.newPage();
    await page.goto("https://x.com/home");
    await expect(post(page, "x-spoiler")).toHaveAttribute("data-unspoiled", "blurred");
    await expect.poll(async () => (await readStorage(["spoilerCount"])).spoilerCount).toBe(1);
  });

  test("shows posts again if the classify API fails", async ({ context, seedStorage }) => {
    await seedStorage({ blocklist: [SHOWS.severance] });
    await context.route("https://unspoiled-api-sable.vercel.app/api/classify", (route) =>
      route.fulfill({ status: 500, body: "" })
    );
    const page = await context.newPage();
    await page.goto("https://x.com/home");
    const spoiler = post(page, "x-spoiler");
    await expect(spoiler.locator(".unspoiled-flag-btn")).toBeAttached();
    await expect(spoiler).not.toHaveAttribute("data-unspoiled-preblur", /.*/);
    await expect(spoiler).toBeVisible();
  });
});

test.describe("YouTube", () => {
  test("covers a spoiler video card and leaves the others", async ({ context, seedStorage, apiCalls }) => {
    await seedStorage({ blocklist: [SHOWS.severance] });
    const page = await context.newPage();
    await page.goto("https://www.youtube.com/");

    await expect(post(page, "yt-spoiler")).toHaveAttribute("data-unspoiled", "blurred");
    await expect(post(page, "yt-spoiler").locator(".unspoiled-yt-overlay")).toBeVisible();
    await expect.poll(() => apiCalls.length).toBe(2);
    await expect(post(page, "yt-safe-mention")).not.toHaveAttribute("data-unspoiled", /.*/);
    await expect(post(page, "yt-unrelated")).not.toHaveAttribute("data-unspoiled", /.*/);
    expect(sentTexts(apiCalls)).not.toContain("10 minute morning workout");
  });
});

test.describe("TikTok", () => {
  test("covers a spoiler video and skips ads", async ({ context, seedStorage, apiCalls }) => {
    await seedStorage({ blocklist: [SHOWS.severance] });
    const page = await context.newPage();
    await page.goto("https://www.tiktok.com/foryou");

    await expect(post(page, "tt-spoiler")).toHaveAttribute("data-unspoiled", "blurred");
    await expect.poll(() => apiCalls.length).toBe(2);
    await expect(post(page, "tt-safe-mention")).not.toHaveAttribute("data-unspoiled", /.*/);
    await expect(post(page, "tt-ad")).not.toHaveAttribute("data-unspoiled", /.*/);
    expect(sentTexts(apiCalls)).not.toContain("Watch the Severance finale ending tonight");
  });
});
