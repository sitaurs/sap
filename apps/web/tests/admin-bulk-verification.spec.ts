import { expect, test, type Page } from "@playwright/test";
import type { SapReport } from "../lib/api/client";
import { failure, fixtureApi, future, ids, json, time } from "./r1-fixtures";

const source: SapReport = {
  id: ids.incident, revision: 1, status: "submitted", categoryId: "plastic",
  scanId: null, description: "Hubungi pelapor di private@example.invalid untuk lokasi ini.",
  reportedSeverity: "small", location: { latitude: -6.2, longitude: 106.8 },
  occurredAt: time, createdAt: time, updatedAt: time, mediaIds: [ids.media],
  resolutionMediaIds: [], publicSummary: null, publishedMediaIds: [], duplicateOfId: null, timeline: [],
};

async function setup(page: Page, partialFailure = false, count = 3) {
  const reports = Array.from({ length: count }, (_, index): SapReport => ({
    ...source, id: `000000${String(index + 1).padStart(2, "0")}-1000-4000-8000-000000000001`,
    revision: index === 1 ? 7 : index + 1,
    publicSummary: index === 1 ? "Sampah plastik ditemukan di taman." : null,
  }));
  const requests = await fixtureApi(page, { role: "admin", handler: async (route, path) => {
    if (path === "/admin/reports") {
      const status = new URL(route.request().url()).searchParams.get("status");
      await json(route, { items: reports.filter(report => report.status === status), nextCursor: null }); return true;
    }
    if (path === "/admin/stats") {
      await json(route, { submittedReports: reports.filter(report => report.status === "submitted").length,
        verifiedReports: reports.filter(report => report.status === "verified").length, inProgressReports: 0,
        resolvedReports: 0, oldestPendingAt: time }); return true;
    }
    if (path === "/admin/audit") {
      await json(route, { items: [
        { id: ids.update, action: "report.decision", targetId: source.id, actorDisplayName: "Moderator sintetis", createdAt: time },
        { id: ids.post, action: "activity_publish", targetId: source.id, actorDisplayName: "Pohon Delima", createdAt: time },
        { id: ids.operation, action: "membership_decided", targetId: source.id, actorDisplayName: "Koordinator sintetis", createdAt: time },
        { id: ids.media, action: "report.assignment.progress", targetId: source.id, actorDisplayName: "Petugas sintetis", createdAt: time },
      ], nextCursor: null }); return true;
    }
    if (path.endsWith("/url")) {
      await json(route, { url: "/images/instagram/publication-empty.svg", expiresAt: future }); return true;
    }
    if (path.endsWith("/decisions")) {
      const index = reports.findIndex(report => path.includes(report.id));
      if (partialFailure && index === 1) await failure(route, 409, "REVISION_CONFLICT");
      else if (partialFailure && index === 2) await failure(route, 503, "SERVICE_UNAVAILABLE");
      else {
        const input = route.request().postDataJSON();
        reports[index] = { ...reports[index], status: input.nextStatus, publicSummary: input.publicSummary, revision: reports[index].revision + 1 };
        await json(route, reports[index]);
      }
      return true;
    }
    return false;
  } });
  await page.goto("/dashboard?view=admin-moderation");
  await expect(page.getByLabel("Pilih semua (maks. 20)")).toBeVisible();
  return { requests, reports };
}

async function review(page: Page) {
  await page.getByLabel("Pilih semua (maks. 20)").check();
  await page.getByRole("button", { name: /Verifikasi massal/ }).click();
  const dialog = page.getByRole("dialog", { name: "Verifikasi massal", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Ringkasan publik laporan 1", { exact: true })).toHaveValue("");
  await expect(dialog.getByLabel("Ringkasan publik laporan 2", { exact: true })).toHaveValue("Sampah plastik ditemukan di taman.");
  await expect(dialog.getByRole("button", { name: "Verifikasi laporan", exact: true })).toBeDisabled();
  await dialog.getByRole("region", { name: "Laporan 1", exact: true }).getByText("Bukti privat", { exact: false }).click();
  await expect(dialog.getByRole("img", { name: "Bukti laporan 1", exact: true })).toBeVisible();
  await dialog.getByLabel("Ringkasan publik laporan 1", { exact: true }).fill("Sampah ditemukan di tepi taman.");
  await dialog.getByLabel("Ringkasan publik laporan 3", { exact: true }).fill("Sampah plastik ditemukan di jalan umum.");
  for (let index = 1; index <= 3; index++) await dialog.getByLabel(`Bukti dan ringkasan laporan ${index} telah diperiksa.`, { exact: true }).check();
  await dialog.getByLabel("Alasan keputusan massal", { exact: true }).fill("Lokasi dan bukti setiap laporan telah diperiksa.");
  await expect(dialog.getByRole("button", { name: "Verifikasi laporan", exact: true })).toBeDisabled();
  await dialog.getByLabel("Saya mengonfirmasi verifikasi semua laporan yang dipilih.", { exact: true }).check();
  return dialog;
}

test("bulk verification reviews summaries, confirms intent and keeps photos private", async ({ page }, testInfo) => {
  const { requests } = await setup(page);
  await expect(page.getByText("Keputusan laporan", { exact: true })).toBeVisible();
  await expect(page.getByText("Pendaftaran kegiatan dibuka", { exact: true })).toBeVisible();
  await expect(page.getByText("Keputusan peserta diperbarui", { exact: true })).toBeVisible();
  await expect(page.getByText("Progres penugasan diperbarui", { exact: true })).toBeVisible();
  await expect(page.getByText("oleh Pohon Delima", { exact: true })).toBeVisible();
  await expect(page.getByText("activity_publish", { exact: true })).toHaveCount(0);
  await expect(page.getByText("report.decision", { exact: true })).toHaveCount(0);
  const dialog = await review(page);
  const submit = dialog.getByRole("button", { name: "Verifikasi laporan", exact: true });
  await expect(submit).toBeEnabled();
  await dialog.getByLabel("Ringkasan publik laporan 1", { exact: true }).fill("Sampah plastik di tepi taman.");
  await expect(dialog.getByLabel("Bukti dan ringkasan laporan 1 telah diperiksa.", { exact: true })).not.toBeChecked();
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Bukti dan ringkasan laporan 1 telah diperiksa.", { exact: true }).check();
  await dialog.getByLabel("Saya mengonfirmasi verifikasi semua laporan yang dipilih.", { exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath("bulk-review.png") });
  const footer = (await dialog.locator("footer").boundingBox())!;
  expect(footer.y + footer.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await submit.click();
  await expect(dialog.getByText("3 dari 3 laporan terverifikasi.", { exact: true })).toBeVisible();
  const decisions = requests.filter(request => request.path.endsWith("/decisions"));
  expect(decisions).toHaveLength(3);
  expect(decisions.map(request => request.revision)).toEqual(["1", "7", "3"]);
  expect(new Set(decisions.map(request => request.key)).size).toBe(3);
  for (const decision of decisions) {
    expect(decision.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(decision.body).toMatchObject({ nextStatus: "verified", reason: "Lokasi dan bukti setiap laporan telah diperiksa." });
    expect(decision.body).not.toHaveProperty("publishMediaIds");
    expect(JSON.stringify(decision.body)).not.toContain("private@example.invalid");
  }
  expect(requests.some(request => /consents|approvals/.test(request.path))).toBe(false);
  await dialog.getByRole("button", { name: "Selesai", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/Tidak ada laporan berstatus/)).toBeVisible();
});

test("bulk verification preserves individual conflicts and continues after failures", async ({ page }, testInfo) => {
  const { requests } = await setup(page, true);
  const dialog = await review(page);
  await dialog.getByRole("button", { name: "Verifikasi laporan", exact: true }).click();
  await expect(dialog.getByText("1 dari 3 laporan terverifikasi.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Laporan 1", exact: true }).getByText("Laporan terverifikasi.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Laporan 2", exact: true }).getByText("Laporan sudah berubah. Muat ulang dan tinjau kembali.")).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Laporan 3", exact: true }).getByText("Synthetic error: SERVICE_UNAVAILABLE")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Verifikasi laporan", exact: true })).toHaveCount(0);
  expect(requests.filter(request => request.path.endsWith("/decisions"))).toHaveLength(3);
  await page.screenshot({ path: testInfo.outputPath("bulk-outcomes.png") });
  await dialog.getByRole("button", { name: "Selesai", exact: true }).click();
  await expect(page.getByRole("button", { name: /Verifikasi massal/ })).toBeDisabled();
});

test("bulk review cancellation makes no decisions and changing filter clears selection", async ({ page }) => {
  const { requests } = await setup(page);
  await page.getByLabel("Pilih semua (maks. 20)").check();
  await page.getByRole("button", { name: /Verifikasi massal/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
  expect(requests.some(request => request.path.endsWith("/decisions"))).toBe(false);
  await page.getByLabel("Filter status", { exact: true }).selectOption("verified");
  await expect(page.getByRole("button", { name: /Verifikasi massal/ })).toHaveCount(0);
  await page.getByLabel("Filter status", { exact: true }).selectOption("submitted");
  await expect(page.getByRole("button", { name: /Verifikasi massal/ })).toBeDisabled();
});

test("bulk selection is limited to twenty reports", async ({ page }) => {
  const { reports, requests } = await setup(page, false, 21);
  await page.getByLabel("Pilih semua (maks. 20)").check();
  await expect(page.getByRole("button", { name: "Verifikasi massal (20)", exact: true })).toBeEnabled();
  const extra = page.getByLabel(`Pilih laporan #${reports[20].id.slice(0, 8)}`, { exact: true });
  await expect(extra).toBeDisabled();
  await page.getByLabel(`Pilih laporan #${reports[0].id.slice(0, 8)}`, { exact: true }).uncheck();
  await extra.check();
  await expect(page.getByRole("button", { name: "Verifikasi massal (20)", exact: true })).toBeEnabled();
  expect(requests.some(request => request.path.endsWith("/decisions"))).toBe(false);
});
