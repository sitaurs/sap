import { expect, test } from "@playwright/test";
import { fixtureApi, ids, json, time, future } from "./r1-fixtures";

const scan = {
  id: ids.operation,
  mediaId: ids.media,
  status: "succeeded" as const,
  outcome: "classified" as const,
  categoryId: "plastic",
  predictions: [{ categoryId: "plastic", score: 0.9 }],
  errorCode: null,
  pointsAwarded: 10,
  pointsReason: "awarded" as const,
  createdAt: time,
  completedAt: time,
};

test("transient signed-image failure refreshes the URL and recovers without a page reload", async ({ page }) => {
  let urlRequests = 0;
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1kAAAAASUVORK5CYII=",
    "base64",
  );
  await fixtureApi(page, {
    handler: async (route, path) => {
      if (path === "/scans") {
        await json(route, { items: [scan], nextCursor: null });
        return true;
      }
      if (path === `/media/${ids.media}/url`) {
        urlRequests += 1;
        await json(route, {
          url: urlRequests === 1 ? "/test-media/stale" : "/test-media/fresh",
          expiresAt: future,
        });
        return true;
      }
      return false;
    },
  });
  await page.route("**/test-media/stale", (route) => route.fulfill({ status: 403 }));
  await page.route("**/test-media/fresh", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: image }),
  );

  await page.goto("/dashboard?view=history");
  const photo = page.locator(`img[alt="Foto unggahan scan #${ids.operation.slice(0, 8)}"]`).first();
  await expect(photo).toBeVisible();
  await expect.poll(() => urlRequests).toBeGreaterThan(1);
  await expect(photo).toHaveAttribute("src", /test-media\/fresh/);
});
