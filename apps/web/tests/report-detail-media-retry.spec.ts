import { expect, test } from "@playwright/test";
import type { SapReport } from "../lib/api/client";
import { fixtureApi, ids, json, time, future } from "./r1-fixtures";

const report: SapReport = {
  id: ids.incident, revision: 1, status: "submitted", categoryId: "plastic", scanId: null,
  description: "Laporan sintetis dengan foto untuk menguji pemulihan URL media.",
  reportedSeverity: "small", location: { latitude: -6.2, longitude: 106.8 },
  occurredAt: time, createdAt: time, updatedAt: time, mediaIds: [ids.media],
  resolutionMediaIds: [], publicSummary: null, publishedMediaIds: [], duplicateOfId: null,
  timeline: [],
};

test("report detail refreshes an expired signed photo URL without reloading the report", async ({ page }) => {
  let urlRequests = 0;
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1kAAAAASUVORK5CYII=",
    "base64",
  );
  await fixtureApi(page, {
    handler: async (route, path) => {
      if (path === "/reports/mine") {
        await json(route, { items: [report], nextCursor: null });
        return true;
      }
      if (path === `/reports/${ids.incident}`) {
        await json(route, report);
        return true;
      }
      if (path === `/media/${ids.media}/url`) {
        urlRequests += 1;
        await json(route, { url: urlRequests === 1 ? "/test-media/report-stale" : "/test-media/report-fresh", expiresAt: future });
        return true;
      }
      if (path === `/media/${ids.media}/consents`) {
        await json(route, { mediaId: ids.media, revision: 1, channels: [], updatedAt: time });
        return true;
      }
      return false;
    },
  });
  await page.route("**/test-media/report-stale", route => route.fulfill({ status: 403 }));
  await page.route("**/test-media/report-fresh", route => route.fulfill({ status: 200, contentType: "image/png", body: image }));

  await page.goto("/dashboard?view=reports");
  await page.getByRole("button", { name: /Lihat detail laporan/ }).click();
  const dialog = page.getByRole("dialog");
  const photo = dialog.getByRole("img", { name: "Bukti laporan 1" });
  await expect(photo).toBeVisible();
  await expect.poll(() => urlRequests).toBeGreaterThan(1);
  await expect(photo).toHaveAttribute("src", /test-media\/report-fresh/);
});
