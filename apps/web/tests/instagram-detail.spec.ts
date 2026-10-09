import { test, expect, type Page } from "@playwright/test";
import { fixtureApi, ids, json, post, preview, permission, time } from "./r1-fixtures";
import type { R1 } from "../lib/api/r1";

async function openDetail(page: Page) {
  await page.goto("/dashboard?view=admin-instagram");
  const row = page.getByRole("button", { name: /Detail Publikasi sintetis/ });
  await row.click();
  const dialog = page.getByRole("dialog", { name: "Detail postingan", exact: true });
  await expect(dialog.getByRole("button", { name: "Setujui konten", exact: true })).toBeEnabled();
  return { dialog, row };
}

test("post detail keeps actions in the viewport with contained preview and usable mobile fields", async ({ page }) => {
  const requests = await fixtureApi(page, { role: "admin" });
  const { dialog } = await openDetail(page);
  const footer = dialog.locator("footer");
  await expect(footer.getByRole("button", { name: "Posting sekarang" })).toBeDisabled();
  await expect(dialog.getByRole("region", { name: "Pratinjau Instagram", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Deskripsi gambar untuk aksesibilitas")).toHaveAttribute("maxlength", "1000");
  const bounds = await footer.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  const body = dialog.locator("[data-post-detail-body]");
  await body.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(dialog.getByLabel("Caption Instagram")).toBeVisible();
  const after = await footer.boundingBox();
  expect(after!.y).toBeCloseTo(bounds!.y, 0);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(requests.some(request => request.method !== "GET")).toBe(false);
  await page.screenshot({ path: test.info().outputPath("instagram-detail-synthetic.png"), fullPage: true });
  await page.setViewportSize(test.info().project.name === "mobile" ? { width: 320, height: 568 } : { width: 1280, height: 720 });
  const smallFooter = await footer.boundingBox();
  expect(smallFooter!.y + smallFooter!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});

test("preview zoom Escape leaves the draft open and closing restores row focus", async ({ page }) => {
  const requests = await fixtureApi(page, { role: "admin" });
  const { dialog, row } = await openDetail(page);
  const zoom = dialog.getByRole("button", { name: "Perbesar", exact: true });
  await zoom.click();
  const viewer = page.getByRole("dialog", { name: "Pratinjau Instagram diperbesar", exact: true });
  await expect(viewer).toBeVisible();
  await viewer.getByRole("button", { name: "Tutup pratinjau" }).press("Escape");
  await expect(viewer).not.toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(zoom).toBeFocused();
  await dialog.getByRole("button", { name: "Tutup panel" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  expect(requests.some(request => request.method !== "GET")).toBe(false);
});

test("unsaved caption and alt text block approval and closing asks before discarding", async ({ page }) => {
  const requests = await fixtureApi(page, { role: "admin" });
  const { dialog } = await openDetail(page);
  await dialog.getByLabel("Caption Instagram").fill("Caption baru untuk pengujian.");
  await dialog.getByLabel("Deskripsi gambar untuk aksesibilitas").fill("Deskripsi baru untuk pengujian.");
  await expect(dialog.getByRole("button", { name: "Setujui konten", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Simpan draf", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("region", { name: "Persetujuan konten" })).toContainText("Perlu ditinjau ulang");
  await dialog.getByRole("button", { name: "Tutup panel" }).click();
  await expect(dialog.getByText("Caption dan deskripsi belum tersimpan.")).toBeVisible();
  await dialog.getByRole("button", { name: "Lanjut mengedit" }).click();
  await expect(dialog.getByLabel("Caption Instagram")).toHaveValue("Caption baru untuk pengujian.");
  await expect(dialog.getByLabel("Deskripsi gambar untuk aksesibilitas")).toHaveValue("Deskripsi baru untuk pengujian.");
  expect(requests.some(request => request.method !== "GET")).toBe(false);
});

test("draft cancellation requires a reason and preserves revision and idempotency contract", async ({ page }) => {
  let current: R1["InstagramPost"] = { ...post };
  const requests = await fixtureApi(page, { role: "admin", handler: async (route, path) => {
    if (path.endsWith("/cancel")) {
      current = { ...current, revision: 2, status: "cancelled", actions: { ...current.actions, edit: { allowed: false, reasonCode: "INVALID_TRANSITION" }, cancel: { allowed: false, reasonCode: "INVALID_TRANSITION" } } };
      await json(route, current); return true;
    }
    if (path === `/admin/instagram/posts/${ids.post}`) { await json(route, current); return true; }
    if (path.endsWith("/preview")) { await json(route, preview(current)); return true; }
    return false;
  } });
  const { dialog } = await openDetail(page);
  await dialog.getByRole("button", { name: "Batalkan draf", exact: true }).click();
  const confirm = dialog.getByRole("button", { name: "Konfirmasi tindakan", exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Alasan", { exact: true }).fill("Draf sintetis dibatalkan untuk pengujian.");
  await confirm.click();
  await expect(dialog.getByText("Draf dibatalkan.", { exact: true }).first()).toBeVisible();
  const cancellation = requests.find(request => request.path.endsWith("/cancel"));
  expect(cancellation?.body).toEqual({ reason: "Draf sintetis dibatalkan untuk pengujian." });
  expect(cancellation?.revision).toBe("1");
  expect(cancellation?.key).toBeTruthy();
  expect(requests.some(request => request.path.endsWith("/publish"))).toBe(false);
});

test("broken final image disables approval and offers a preview refresh without private source fallback", async ({ page }) => {
  const current = { ...post, rendition: { ...post.rendition, url: "/__missing-instagram-poster.png" } };
  const requests = await fixtureApi(page, { role: "admin", handler: async (route, path) => {
    if (path === `/admin/instagram/posts/${ids.post}`) { await json(route, current); return true; }
    if (path.endsWith("/preview")) { await json(route, preview(current)); return true; }
    return false;
  } });
  await page.route("**/__missing-instagram-poster.png", route => route.fulfill({ status: 404, body: "" }));
  await page.goto("/dashboard?view=admin-instagram");
  await page.getByRole("button", { name: /Detail Publikasi sintetis/ }).click();
  const dialog = page.getByRole("dialog", { name: "Detail postingan", exact: true });
  await expect(dialog.getByText(/Preview kedaluwarsa/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Setujui konten", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Perbesar", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Perbarui versi dan preview" })).toBeEnabled();
  expect(requests.some(request => request.path === `/media/${ids.media}/url`)).toBe(false);
});

test("published posts retain read-only fields, real timestamps and permitted retraction", async ({ page }) => {
  const current: R1["InstagramPost"] = { ...post, status: "published", publishedAt: time, permalink: "https://www.instagram.com/p/TEST_ONLY/",
    approval: { status: "approved", contentRevision: 1, sourceRevision: 1, renditionId: ids.rendition, approvedAt: time },
    actions: { ...post.actions, edit: { allowed: false, reasonCode: "INVALID_TRANSITION" }, approve: { allowed: false, reasonCode: "INVALID_TRANSITION" }, publish: { allowed: false, reasonCode: "INVALID_TRANSITION" }, retract: permission } };
  await fixtureApi(page, { role: "admin", handler: async (route, path) => {
    if (path === "/admin/instagram/posts") { await json(route, { items: [current], nextCursor: null, total: 1 }); return true; }
    if (path === `/admin/instagram/posts/${ids.post}`) { await json(route, current); return true; }
    if (path.endsWith("/preview")) { await json(route, preview(current)); return true; }
    return false;
  } });
  await page.goto("/dashboard?view=admin-instagram");
  await page.getByRole("button", { name: /Detail Publikasi sintetis/ }).click();
  const dialog = page.getByRole("dialog", { name: "Detail postingan", exact: true });
  await expect(dialog.getByLabel("Caption Instagram")).toHaveAttribute("readonly", "");
  await expect(dialog.getByRole("button", { name: "Posting sekarang", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Tarik postingan", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("link", { name: "Periksa di Instagram" })).toHaveAttribute("href", current.permalink!);
  await expect(dialog.locator("footer")).toContainText("Postingan sudah diterbitkan di Instagram.");
  await expect(dialog.getByText("Konten disetujui; belum diposting.")).toHaveCount(0);
});
