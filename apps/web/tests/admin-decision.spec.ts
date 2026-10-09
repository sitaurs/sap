import { test, expect, type Page } from "@playwright/test";
import { fixtureApi, failure, future, ids, json, permission, time } from "./r1-fixtures";
import type { SapReport } from "../lib/api/client";
import type { ReportLifecycle } from "../lib/api/community";

const report: SapReport = {
  id: ids.incident, revision: 1, status: "submitted", categoryId: "plastic",
  scanId: null, description: "Laporan sintetis untuk keputusan admin.",
  reportedSeverity: "small", location: { latitude: -6.2, longitude: 106.8 },
  occurredAt: time, createdAt: time, updatedAt: time, mediaIds: [ids.media],
  resolutionMediaIds: [], publicSummary: null, publishedMediaIds: [],
  duplicateOfId: null, timeline: [],
};

async function setup(page: Page, status: SapReport["status"] = "submitted", readyEvidence = status !== "submitted", photoCount = 1) {
  const current = { ...report, status, mediaIds: Array.from({ length: photoCount }, (_, index) => index === 0 ? ids.media : ids.update) };
  let approved = false;
  const lifecycle = (): ReportLifecycle => ({
    reportId: current.id, sourceRevision: approved ? 2 : 1,
    publicVisibility: "hidden", instagramAllowed: false, latestReview: null,
    approvedResolutionEvidence: [], resolutionReviewRequired: false,
    publicationAssets: approved ? [{ mediaId: ids.media, renditionId: ids.rendition,
      channels: ["web"], sourceType: "report", sourceId: current.id }] : [],
    publicationMilestones: [], instagramPublicationSeries: [], actions: { moderate: permission, withdraw: permission,
      restore: permission, createInstagramDraft: permission },
  });
  const uploads: string[] = [];
  const requests = await fixtureApi(page, { role: "admin", handler: async (route, path) => {
    if (path === `/reports/${current.id}`) { await json(route, current); return true; }
    if (path === "/admin/reports" || path === "/admin/audit-events") {
      await json(route, { items: [], nextCursor: null }); return true;
    }
    if (path === "/admin/stats") {
      await json(route, { submittedReports: 1, verifiedReports: 0, inProgressReports: 0,
        resolvedReports: 0, oldestPendingAt: time }); return true;
    }
    if (path.endsWith("/lifecycle")) { await json(route, lifecycle()); return true; }
    if (path.endsWith("/url")) {
      await json(route, { url: "/images/instagram/publication-empty.svg", expiresAt: future }); return true;
    }
    if (path.endsWith("/renditions")) {
      await json(route, { items: readyEvidence ? [{ id: ids.rendition, mediaId: ids.media, revision: 1,
        status: "ready", url: null, expiresAt: future, redactions: [] }] : [], nextCursor: null }); return true;
    }
    if (path.endsWith("/approvals")) {
      if (status === "submitted") await failure(route, 422, "EVIDENCE_INVALID");
      else { approved = true; await json(route, lifecycle()); }
      return true;
    }
    if (path === "/media") {
      uploads.push(route.request().postDataBuffer()?.toString() ?? "");
      await json(route, { id: ids.update }); return true;
    }
    if (path.endsWith("/decisions")) {
      await json(route, { ...current, status: route.request().postDataJSON().nextStatus }); return true;
    }
    return false;
  } });
  await page.goto(`/dashboard?view=admin-moderation&reviewReport=${current.id}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  return { requests, uploads, dialog: page.getByRole("dialog") };
}

test("verification explains disabled save and succeeds without photo consent or publication", async ({ page }) => {
  const { dialog, requests } = await setup(page);
  const save = dialog.getByRole("button", { name: "Simpan keputusan", exact: true });
  await expect(save).toBeDisabled();
  await expect(dialog.getByText("Isi alasan keputusan sepanjang 5–1000 karakter.")).toBeVisible();
  await expect(dialog.getByText("Isi ringkasan publik untuk verifikasi awal.")).toBeVisible();
  await dialog.getByLabel("Alasan keputusan").fill("Lokasi dan kondisi sudah diperiksa.");
  await dialog.getByLabel("Ringkasan publik").fill("Sampah plastik ditemukan di taman.");
  await expect(dialog.getByText("Web: foto belum disetujui", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Tandai untuk publikasi" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Siapkan pratinjau bukti", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Setujui web", exact: true })).toHaveCount(0);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(requests.find(r => r.path.endsWith("/decisions"))?.body).toEqual({
    nextStatus: "verified", reason: "Lokasi dan kondisi sudah diperiksa.",
    publicSummary: "Sampah plastik ditemukan di taman.",
  });
  expect(requests.some(r => /consent/.test(r.path))).toBe(false);
  expect(requests.some(r => r.path.endsWith("/approvals"))).toBe(false);
});

test("failed photo approval for missing consent does not block verification", async ({ page }) => {
  const { dialog, requests } = await setup(page, "submitted", true);
  await dialog.getByLabel("Alasan keputusan").fill("Lokasi dan kondisi sudah diperiksa.");
  await dialog.getByLabel("Ringkasan publik").fill("Sampah plastik ditemukan di taman.");
  await dialog.getByRole("button", { name: "Setujui web", exact: true }).click();
  await expect(dialog.getByText("Synthetic error: EVIDENCE_INVALID")).toBeVisible();
  const save = dialog.getByRole("button", { name: "Simpan keputusan", exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(requests.find(r => r.path.endsWith("/decisions"))?.body).not.toHaveProperty("publishMediaIds");
  expect(requests.some(r => /consent/.test(r.path))).toBe(false);
});

test("resolution uploads the required purpose and sends uploaded IDs", async ({ page }) => {
  const { dialog, requests, uploads } = await setup(page, "in_progress");
  await dialog.getByLabel("Status baru").selectOption("resolved");
  await dialog.getByLabel("Alasan keputusan").fill("Area sudah dibersihkan dan bukti dilampirkan.");
  await expect(dialog.getByText("Unggah minimal satu foto bukti penyelesaian.")).toBeVisible();
  await dialog.getByLabel("Unggah bukti penyelesaian").setInputFiles({
    name: "resolution.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1kAAAAASUVORK5CYII=", "base64"),
  });
  const save = dialog.getByRole("button", { name: "Simpan keputusan", exact: true });
  await expect(save).toBeEnabled();
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toMatch(/name="purpose"\r\n\r\nresolution\r\n/);
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(requests.find(r => r.path.endsWith("/decisions"))?.body).toEqual({
    nextStatus: "resolved", reason: "Area sudah dibersihkan dan bukti dilampirkan.",
    resolutionMediaIds: [ids.update],
  });
});

test("explicit web approval shows channel status and decision uses its latest revision", async ({ page }) => {
  const { dialog, requests } = await setup(page, "verified");
  await expect(dialog.getByText("Web: foto belum disetujui", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Setujui web", exact: true }).click();
  await expect(dialog.getByText("Web: foto publik disetujui", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Instagram: foto belum disetujui", { exact: true })).toBeVisible();
  await dialog.getByLabel("Alasan keputusan").fill("Informasi laporan telah diperiksa ulang.");
  await dialog.getByRole("button", { name: "Simpan keputusan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const decision = requests.find(r => r.path.endsWith("/decisions"));
  expect(decision?.revision).toBe("2");
  expect(decision?.body).not.toHaveProperty("publishMediaIds");
  expect(requests.filter(r => r.path.endsWith("/approvals"))).toHaveLength(1);
});

test("dialog fills the viewport layer, keeps actions visible, and restores keyboard focus", async ({ page }) => {
  const { dialog, requests } = await setup(page);
  const viewport = page.viewportSize()!;
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  expect(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(await dialog.evaluate(element => (element as HTMLDialogElement).matches(":modal"))).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  const footer = dialog.locator("footer");
  const before = await footer.boundingBox();
  await dialog.locator("[data-moderation-body]").evaluate(element => { element.scrollTop = element.scrollHeight; });
  expect(await footer.boundingBox()).toEqual(before);
  const close = dialog.getByRole("button", { name: "Tutup", exact: true });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Batal", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  expect(requests.some(request => request.path.endsWith("/decisions") || request.path.endsWith("/approvals"))).toBe(false);
});

test("reviewing a rejection retains private evidence and photo enlargement has its own close", async ({ page }) => {
  const { dialog, requests } = await setup(page);
  await dialog.getByLabel("Status baru").selectOption("rejected");
  await expect(dialog.getByRole("img", { name: "Bukti laporan 1", exact: true })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Izin publikasi foto 1" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Perbesar foto 1" }).click();
  const viewer = page.getByRole("dialog", { name: "Bukti laporan 1", exact: true });
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).not.toBeVisible();
  await expect(dialog).toBeVisible();
  expect(requests.some(request => request.path.endsWith("/decisions") || request.path.endsWith("/approvals"))).toBe(false);
});

test("empty evidence and multiple photos preserve the decision form and footer", async ({ page }) => {
  let state = await setup(page, "submitted", false, 0);
  await expect(state.dialog.getByText("Laporan ini tidak memiliki foto bukti.")).toBeVisible();
  await state.dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await page.unrouteAll({ behavior: "wait" });
  state = await setup(page, "submitted", false, 2);
  await expect(state.dialog.getByRole("button", { name: "Perbesar foto 2" })).toBeVisible();
  await state.dialog.getByLabel("Alasan keputusan").fill("Bukti telah diperiksa oleh moderator.");
  await state.dialog.getByLabel("Ringkasan publik").fill("Tumpukan sampah ditemukan di area taman.");
  await expect(state.dialog.getByRole("button", { name: "Simpan keputusan", exact: true })).toBeEnabled();
  const viewport = page.viewportSize()!;
  const footer = (await state.dialog.locator("footer").boundingBox())!;
  expect(footer.y + footer.height).toBeLessThanOrEqual(viewport.height);
});
