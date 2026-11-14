// The toolbar popup, opened as a tab. TMDB search is mocked so results are always the same.
const { test, expect, SHOWS } = require("./fixtures");

const TMDB_RESULTS = {
  results: [
    { id: SHOWS.severance.id, media_type: "tv", name: "Severance", first_air_date: "2022-02-17", poster_path: null },
    { id: 1, media_type: "person", name: "Severance Person" },
    { id: 2, media_type: "movie", title: "Severance", release_date: "2006-08-25", poster_path: null },
  ],
};

test("searching TMDB and picking a result adds it to the blocklist", async ({ context, extensionId, readStorage }) => {
  await context.route("https://api.themoviedb.org/3/search/multi**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TMDB_RESULTS) })
  );
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup.html`);

  await page.locator("#show-search").fill("Severance");
  const items = page.locator(".autocomplete-item");
  await expect(items).toHaveCount(2); // the person result is filtered out
  await expect(items.first()).toContainText("TV Series · 2022");

  await items.first().click();
  await expect(page.locator("#blocklist li")).toContainText("Severance");
  await expect.poll(async () => (await readStorage(["blocklist"])).blocklist).toEqual([SHOWS.severance]);

  await page.locator("#blocklist li button").click();
  await expect(page.locator("#blocklist li")).toHaveCount(0);
  await expect.poll(async () => (await readStorage(["blocklist"])).blocklist).toEqual([]);
});
