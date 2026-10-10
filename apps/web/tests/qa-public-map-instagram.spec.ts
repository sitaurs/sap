import { test, expect, type Page } from "@playwright/test";
import { activity, fixtureApi, ids, incident, json, permission, time } from "./r1-fixtures";
import { gridDisk } from "h3-js";

async function language(page: Page, locale: "id" | "en") {
  await page.context().addCookies([{ name: "sap_locale", value: locale, url: test.info().project.use.baseURL as string }]);
}

for (const locale of ["id", "en"] as const) {
  test(`public descriptions and supporter counts stay complete in ${locale}`, async ({ page }) => {
    await language(page, locale);
    const summary = "Synthetic summary: verified evidence awaits community follow-up. ".repeat(7).trim();
    const requests = await fixtureApi(page, { guest: true, handler: async (route, path) => {
      if (path === "/public/incidents") {
        await json(route, { items: [{ ...incident, summary, supportCount: 0 }], nextCursor: null });
        return true;
      }
      if (path === `/public/incidents/${ids.incident}`) {
        await json(route, { ...incident, summary, supportCount: 0 });
        return true;
      }
      return false;
    } });
    await page.goto("/incidents");
    const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: incident.title }) });
    await expect(card).toBeVisible();
    await expect(card.locator('[class*="supportCount"]')).toHaveText(locale === "en" ? "0 community supporters" : "0 dukungan warga");
    const description = card.locator('[class*="cardSummary"]');
    await expect(description).toHaveText(summary);
    expect(await description.evaluate(node => {
      const style = getComputedStyle(node);
      return style.webkitLineClamp === "none" && node.scrollHeight <= node.clientHeight + 1;
    })).toBe(true);
    await page.goto(`/incidents/${ids.incident}`);
    const detailDescription = page.locator("main p").filter({ hasText: summary });
    await expect(detailDescription).toHaveText(summary);
    expect(await detailDescription.evaluate(node => getComputedStyle(node).webkitLineClamp)).toBe("none");
    await expect(page.locator("main")).toContainText(locale === "en" ? "0 community supporters" : "0 dukungan warga");
    expect(await page.locator("main").innerText()).not.toMatch(/ADMIN SAP/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(requests.every(request => request.method === "GET")).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`public-incidents-${locale}.png`), fullPage: true });
  });

  test(`public activities use citizen labels and spaced participant counts in ${locale}`, async ({ page }) => {
    await language(page, locale);
    const requests = await fixtureApi(page, { guest: true, handler: async (route, path) => {
      const item = { ...activity, acceptedCount: 0, capacity: 1, availableSeats: 1 };
      if (path === "/activities") { await json(route, { items: [item], nextCursor: null }); return true; }
      if (path === `/activities/${ids.activity}`) { await json(route, item); return true; }
      return false;
    } });
    await page.goto("/activities");
    const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Bersih taman · TEST" }) });
    await expect(card.locator('[class*="metadataItem"]').nth(2)).toHaveText(locale === "en" ? "0/1 participants · 1 places available" : "0/1 peserta · 1 tempat tersedia");
    expect(await page.locator("main").innerText()).not.toMatch(/ADMIN SAP/i);
    await page.goto(`/activities/${ids.activity}`);
    await expect(page.getByRole("heading", { name: "Bersih taman · TEST" })).toBeVisible();
    const participation = page.getByRole("complementary", { name: locale === "en" ? "Join activity" : "Ikut kegiatan" });
    await expect(participation.locator("strong")).toHaveText(locale === "en" ? "0 / 1 participants accepted" : "0 / 1 peserta diterima");
    await expect(participation.locator("p").first()).toHaveText(locale === "en" ? "1 places available" : "1 tempat tersedia");
    await expect(page.getByRole("link", { name: locale === "en" ? "Sign in to join" : "Masuk untuk ikut" })).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(/ADMIN SAP/i);
    expect(requests.every(request => request.method === "GET")).toBe(true);
  });
}

for (const message of ["   ", '""']) {
  test(`Instagram eligibility recovers from empty error ${JSON.stringify(message)}`, async ({ page }) => {
    let checks = 0;
    const requests = await fixtureApi(page, { role: "admin", handler: async (route, path) => {
      if (path === "/admin/instagram/reports") {
        await json(route, { items: [{ reportId: ids.incident, scanId: null, status: "verified", publicSummary: incident.summary,
          categoryName: "Plastik", occurredAt: time, createdAt: time, mediaIds: [ids.media] }], nextCursor: null });
        return true;
      }
      if (path === `/admin/reports/${ids.incident}/lifecycle`) {
        if (++checks === 1) {
          await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: { code: "ELIGIBILITY_CHECK_FAILED", message } }) });
        } else {
          await json(route, { reportId: ids.incident, sourceRevision: 1, publicVisibility: "public", instagramAllowed: true,
            publicationAssets: [{ mediaId: ids.media, renditionId: ids.rendition, channels: ["instagram"], sourceType: "report", sourceId: ids.incident }],
            publicationMilestones: [], instagramPublicationSeries: [], approvedResolutionEvidence: [],
            actions: { createInstagramDraft: permission } });
        }
        return true;
      }
      if (path === `/admin/reports/${ids.incident}/publications`) {
        await json(route, { items: [], nextCursor: null }); return true;
      }
      return false;
    } });
    await page.goto("/dashboard?view=admin-instagram");
    await page.locator("header").getByRole("button", { name: "Pilih laporan", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Pilih sumber publikasi" });
    await picker.getByRole("button", { name: "Periksa kelayakan publikasi" }).click();
    await expect(picker.getByRole("alert")).toHaveText("Permintaan belum berhasil. Coba lagi.");
    await expect(picker.getByRole("button", { name: "Pilih foto berizin 1" })).toHaveCount(0);
    await picker.getByRole("button", { name: "Muat ulang", exact: true }).click();
    await expect(picker.getByRole("button", { name: "Pilih foto berizin 1" })).toBeEnabled();
    await expect(picker.getByRole("alert")).toHaveCount(0);
    expect(checks).toBe(2);
    expect(requests.every(request => request.method === "GET")).toBe(true);
  });
}

test("area list and detail show provided names, translated risks and no internal version", async ({ page }) => {
  const cellId = "898d85c230fffff";
  const feature = { type: "Feature", id: cellId, geometry: { type: "Polygon", coordinates: [[[112.63, -7.98], [112.64, -7.98], [112.635, -7.97], [112.63, -7.98]]] },
    properties: { cellId, incidentCount: 3, openIncidentCount: 2, resolvedIncidentCount: 1, distinctDays: 2, riskLevel: "medium" } };
  const metadata = { from: time, to: time, asOf: time, methodVersion: "reports-h3-v1", isStale: false };
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/areas") { await json(route, { type: "FeatureCollection", features: [feature], ...metadata }); return true; }
    if (path === "/area-localities") { await json(route, { items: [{ cellId, kelurahan: "Kelurahan uji", kecamatan: "Kecamatan uji", city: "Kota uji", label: "Kelurahan uji, Kecamatan uji" }] }); return true; }
    if (path === `/areas/${cellId}`) { await json(route, { feature, ...metadata }); return true; }
    if (path === `/areas/${cellId}/reports`) { await json(route, { items: [], nextCursor: null }); return true; }
    return false;
  } });
  await page.route("https://*.tile.openstreetmap.org/**", route => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=", "base64") }));
  await page.goto("/dashboard?view=map");
  await expect(page.getByText("1 area memiliki data.", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Diperbarui: /)).toBeVisible();
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  const row = page.getByRole("button", { name: /Kelurahan uji, Kecamatan uji/ });
  await expect(row).toContainText("3 laporan · 2 terbuka · Risiko Sedang");
  await row.click();
  await expect(page.getByRole("heading", { name: "Kelurahan uji, Kecamatan uji" })).toBeVisible();
  await expect(page.getByText("Risiko: Sedang", { exact: true })).toBeVisible();
  await page.getByText("Bagaimana area dibentuk?", { exact: true }).click();
  await expect(page.getByText(/Laporan dikelompokkan berdasarkan lokasi ke sel grid H3 resolusi 9/)).toBeVisible();
  await expect(page.getByText(/Nama kelurahan, kecamatan, dan kota dikurasi manual oleh admin/)).toBeVisible();
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await row.click();
  await expect(page.getByRole("heading", { name: "Kelurahan uji, Kecamatan uji" })).toBeVisible();
  const visible = await page.locator("main").innerText();
  expect(visible).not.toContain("reports-h3-v1");
  expect(visible).not.toContain(cellId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(requests.every(request => request.method === "GET")).toBe(true);
  expect(requests.filter(request => request.path === "/area-localities")).toHaveLength(1);
  expect(requests.filter(request => request.path.endsWith("/locality"))).toHaveLength(0);
  await page.screenshot({ path: test.info().outputPath("area-labels-and-method.png"), fullPage: true });
});

test("map category options are localized from API names", async ({ page }) => {
  const categories = [
    { id: "battery", name: "Baterai" }, { id: "biological", name: "Sampah organik" },
    { id: "cardboard", name: "Kardus" }, { id: "clothes", name: "Pakaian" },
    { id: "glass", name: "Kaca" }, { id: "metal", name: "Logam" },
    { id: "paper", name: "Kertas" }, { id: "plastic", name: "Plastik" },
    { id: "shoes", name: "Sepatu" }, { id: "trash", name: "Sampah lainnya" },
  ];
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/categories") { await json(route, { items: categories, nextCursor: null }); return true; }
    return false;
  } });

  for (const locale of ["id", "en"] as const) {
    await language(page, locale);
    await page.goto("/dashboard?view=map");
    const categorySelect = page.getByRole("combobox", { name: locale === "en" ? "Map waste category" : "Kategori sampah peta" });
    await expect(categorySelect.locator("option")).toHaveText(locale === "en"
      ? ["All categories", "Battery", "Organic waste", "Cardboard", "Clothes", "Glass", "Metal", "Paper", "Plastic", "Shoes", "Other waste"]
      : ["Semua kategori", ...categories.map(category => category.name)]);
  }
  expect(requests.every(request => request.method === "GET")).toBe(true);
});

test("locality lookup batches at most 100 cells and fetches the selected remainder once", async ({ page }) => {
  const cells = gridDisk("898d85c230fffff", 6).slice(0, 101);
  const selectedCell = cells[100];
  const features = cells.map(cellId => ({ type: "Feature", id: cellId,
    geometry: { type: "Polygon", coordinates: [[[112.63, -7.98], [112.64, -7.98], [112.635, -7.97], [112.63, -7.98]]] },
    properties: { cellId, incidentCount: 1, openIncidentCount: 1, resolvedIncidentCount: 0, distinctDays: 1, riskLevel: "low" } }));
  const metadata = { from: time, to: time, asOf: time, methodVersion: "reports-h3-v1", isStale: false };
  let batchedCells: string[] = [];
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/areas") { await json(route, { type: "FeatureCollection", features, ...metadata }); return true; }
    if (path === "/area-localities") {
      batchedCells = new URL(route.request().url()).searchParams.get("cells")!.split(",");
      await json(route, { items: [] }); return true;
    }
    if (path === `/areas/${selectedCell}`) { await json(route, { feature: features[100], ...metadata }); return true; }
    if (path === `/areas/${selectedCell}/locality`) {
      await json(route, { cellId: selectedCell, kelurahan: null, kecamatan: null, city: null, label: "Label admin untuk pengujian" }); return true;
    }
    if (path === `/areas/${selectedCell}/reports`) { await json(route, { items: [], nextCursor: null }); return true; }
    return false;
  } });
  await page.route("https://*.tile.openstreetmap.org/**", route => route.abort());
  await page.goto("/dashboard?view=map");
  await expect(page.getByText("101 area memiliki data.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await expect(page.locator('[class*="areaRow"]')).toHaveCount(101);
  await expect(page.locator('[class*="areaRow"]').last()).toContainText("Area laporan");
  await page.locator('[class*="areaRow"]').last().click();
  await expect(page.getByRole("heading", { name: "Label admin untuk pengujian" })).toBeVisible();
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await expect(page.locator('[class*="areaRow"]').last()).toContainText("Label admin untuk pengujian");
  await page.locator('[class*="areaRow"]').last().click();
  await expect(page.getByRole("heading", { name: "Label admin untuk pengujian" })).toBeVisible();
  expect(batchedCells).toEqual(cells.slice(0, 100));
  expect(requests.filter(request => request.path === "/area-localities")).toHaveLength(1);
  expect(requests.filter(request => request.path.endsWith("/locality"))).toHaveLength(1);
  expect(requests.every(request => request.method === "GET")).toBe(true);
});

test("Instagram picker explains when the public source summary is too short", async ({ page }) => {
  const requests = await fixtureApi(page, { role: "admin", handler: async (route, path) => {
    if (path === "/admin/instagram/reports") {
      await json(route, { items: [{ reportId: ids.incident, scanId: ids.operation, status: "verified", publicSummary: "bagus",
        categoryName: "Plastik", occurredAt: time, createdAt: time, mediaIds: [ids.media] }], nextCursor: null });
      return true;
    }
    if (path === `/admin/reports/${ids.incident}/lifecycle`) {
      await json(route, { reportId: ids.incident, sourceRevision: 1, publicVisibility: "public", instagramAllowed: true,
        publicationAssets: [{ mediaId: ids.media, renditionId: ids.rendition, channels: ["instagram"], sourceType: "report", sourceId: ids.incident }],
        publicationMilestones: [], instagramPublicationSeries: [], approvedResolutionEvidence: [], actions: { createInstagramDraft: permission } });
      return true;
    }
    if (path === `/public/incidents/${ids.incident}`) { await json(route, incident); return true; }
    if (path === `/admin/reports/${ids.incident}/publications`) { await json(route, { items: [], nextCursor: null }); return true; }
    return false;
  } });
  await page.goto("/dashboard?view=admin-instagram");
  await page.locator("header").getByRole("button", { name: "Pilih laporan", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Pilih sumber publikasi" });
  await expect(picker.getByRole("heading", { name: "bagus", exact: true })).toBeVisible();
  await picker.getByRole("button", { name: "Periksa kelayakan publikasi" }).click();
  await expect(picker.getByText("Ringkasan publik sumber terlalu singkat. Perbarui menjadi minimal 20 karakter lewat moderasi sebelum membuat draf Instagram.")).toBeVisible();
  await expect(picker.getByRole("button", { name: /Pilih foto berizin/ })).toHaveCount(0);
  expect(requests.every(request => request.method === "GET")).toBe(true);
});
