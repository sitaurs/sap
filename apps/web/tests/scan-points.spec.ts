import { test, expect } from "@playwright/test";
import type { SapScan } from "../lib/api/client";
import { scanPointsMessage } from "../components/scan-points";
import { fixtureApi, ids, json, time } from "./r1-fixtures";

const base: SapScan = {
  id: ids.operation, status: "succeeded", outcome: "classified", categoryId: "plastic",
  predictions: [{ categoryId: "plastic", score: 0.9 }], errorCode: null,
  pointsAwarded: 0, createdAt: time, completedAt: time,
};
const cases: { name: string; scan: SapScan; message: string }[] = [
  { name: "awarded", scan: { ...base, pointsAwarded: 10, pointsReason: "awarded" }, message: "+10 poin telah ditambahkan." },
  { name: "daily cap", scan: { ...base, pointsReason: "daily_limit" }, message: "0 poin: batas harian 5 scan berhadiah (50 poin) telah tercapai. Poin tersedia lagi besok (WIB)." },
  { name: "duplicate", scan: { ...base, pointsReason: "duplicate_image" }, message: "0 poin: foto yang sama sudah dipindai hari ini (WIB)." },
  { name: "unknown material", scan: { ...base, outcome: "unknown", categoryId: null }, message: "0 poin: material sampah belum dikenali." },
  { name: "legacy unexplained zero", scan: base, message: "0 poin: alasan poin tidak diberikan belum tersedia." },
];

test("point feedback handles pending, failed, no waste, and legacy positive awards", () => {
  expect(scanPointsMessage({ ...base, status: "processing" }).text).toBe("Poin menunggu hasil scan.");
  expect(scanPointsMessage({ ...base, status: "failed" }).text).toContain("belum berhasil");
  expect(scanPointsMessage({ ...base, outcome: "no_waste" }).text).toContain("belum dikenali");
  expect(scanPointsMessage({ ...base, pointsAwarded: 10 })).toEqual({ text: "+{0} poin telah ditambahkan.", points: 10 });
});

for (const scenario of cases) {
  test(`scan result shows ${scenario.name} points after polling`, async ({ page }, testInfo) => {
    const requests = await fixtureApi(page, { handler: async (route, path) => {
      if (path === "/media") { await json(route, { id: ids.media }); return true; }
      if (path === "/scans" && route.request().method() === "POST") {
        await json(route, { ...base, status: "queued", outcome: null, categoryId: null, completedAt: null, pointsReason: "pending" }, 202);
        return true;
      }
      if (path === `/scans/${base.id}`) { await json(route, scenario.scan); return true; }
      return false;
    } });
    await page.goto("/dashboard?view=scan");
    await page.getByLabel("Unggah foto dari perangkat").setInputFiles({
      name: "scan.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=", "base64"),
    });
    await page.getByRole("button", { name: "Pindai dengan AI" }).click();
    await expect(page.getByText(scenario.message, { exact: true })).toBeVisible();
    expect(requests.filter(request => request.path === "/scans" && request.method === "POST")).toHaveLength(1);
    if (scenario.name === "daily cap") await page.screenshot({ path: testInfo.outputPath("scan-points-result.png"), fullPage: true });
  });

  test(`history detail shows ${scenario.name} points`, async ({ page }, testInfo) => {
    await fixtureApi(page, { handler: async (route, path) => {
      if (path === "/scans") { await json(route, { items: [scenario.scan], nextCursor: null }); return true; }
      if (path === `/scans/${base.id}`) { await json(route, scenario.scan); return true; }
      return false;
    } });
    await page.goto("/dashboard?view=history");
    await page.getByRole("button", { name: /^Lihat detail / }).click();
    await expect(page.getByRole("dialog").getByText(scenario.message, { exact: true })).toBeVisible();
    if (scenario.name === "daily cap") await page.screenshot({ path: testInfo.outputPath("scan-points-history.png"), fullPage: true });
  });
}
