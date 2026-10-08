import { expect, test, type Page } from "@playwright/test";
import type { AdminCommunityUpdate, EvidenceRendition, ReviewRun } from "../lib/api/community";
import { fixtureApi, future, ids, json, time, update as baseUpdate } from "./r1-fixtures";

// Synthetic API contracts only. Unhandled calls fail closed; no real moderation is performed.
const photo = "/images/community/community-cleanup.webp";
const review: ReviewRun = {
  id: ids.operation, subjectType: "community_update", subjectId: ids.update, subjectRevision: 1,
  reportId: ids.incident, sourceReportRevision: 1, snapshotHash: "synthetic-snapshot",
  status: "completed", requiresHumanReview: true, errorCode: null, modelVersion: "test", policyVersion: "test",
  createdAt: time, finishedAt: time,
  result: {
    schemaVersion: "sap-evidence-review-v1", subjectType: "community_update", subjectId: ids.update, subjectRevision: 1,
    sourceReportId: ids.incident, sourceReportRevision: 1, snapshotHash: "synthetic-snapshot", recommendation: "human_review",
    reasonCodes: ["EVIDENCE_CONFLICT", "IMAGE_UNCLEAR", "MORE_EVIDENCE_REQUIRED", "LOCATION_UNCONFIRMED", "TIME_UNCONFIRMED"],
    evidence: [{ mediaId: ids.media, observation: "Bukti sintetis belum memastikan kondisi terbaru di lokasi. Moderator perlu memeriksa sumber dan meminta foto kondisi aktual." }],
    duplicateCandidates: [], missingEvidence: ["Foto kondisi lokasi terbaru"], publicationWarnings: ["Periksa izin dan informasi pribadi sebelum publikasi"],
    publicSummaryProposal: "Pembaruan mengenai pembersihan sampah memerlukan tinjauan lebih lanjut dan bukti kondisi lokasi aktual.",
  },
};
const initial: AdminCommunityUpdate = { ...baseUpdate, kind: "reduced", status: "submitted", revision: 1, description: "QA TEST: Terlihat ada upaya pembersihan, tumpukan sampah berkurang dibanding foto sebelumnya.", observedAt: "2026-10-07T13:15:00Z", requestedEvidence: [], decisionReason: null, mediaIds: [ids.media], latestReview: review };
const ready: EvidenceRendition = { id: ids.rendition, mediaId: ids.media, revision: 1, status: "ready", url: photo, expiresAt: future, redactions: [] };

async function setup(page: Page, options: { second?: boolean; multiple?: boolean; queued?: boolean; failed?: boolean; noRendition?: boolean } = {}) {
  const secondId = "00000004-1000-4000-8000-000000000014", secondMedia = "00000007-1000-4000-8000-000000000017";
  const current: AdminCommunityUpdate = { ...initial, mediaIds: options.multiple ? [ids.media, secondMedia] : initial.mediaIds, latestReview: { ...review, status: options.queued ? "queued" : options.failed ? "failed" : "completed", result: options.queued || options.failed ? null : review.result, errorCode: options.failed ? "SYNTHETIC_FAILURE" : null } };
  let rendered = !options.noRendition;
  let renditionPolls = 0;
  const requests = await fixtureApi(page, { role: "admin", handler: async (route, path) => {
    const method = route.request().method();
    if (path === "/admin/review-queue") {
      const items = [current, ...(options.second ? [{ ...initial, id: secondId }] : [])].filter(item => item.status === "submitted").map(item => ({ subjectType: "community_update", subjectId: item.id, subjectRevision: item.revision, reportId: item.reportId, title: item.id === secondId ? "Pembaruan lainnya" : "Pembaruan kondisi", submittedAt: time, reviewState: "pending", latestReview: item.latestReview }));
      await json(route, { items, nextCursor: null }); return true;
    }
    if (path === `/admin/community-updates/${ids.update}`) { await json(route, current); return true; }
    if (path === `/admin/community-updates/${secondId}`) { await json(route, { ...initial, id: secondId, kind: "looks_clean" }); return true; }
    if (/\/admin\/community-updates\/[^/]+\/media\/[^/]+\/url$/.test(path)) { await json(route, { url: photo, expiresAt: future }); return true; }
    if (/^\/admin\/media\/[^/]+\/renditions$/.test(path)) {
      const mediaId = path.split("/")[3];
      if (method === "POST") { rendered = true; renditionPolls = 0; await json(route, { ...ready, mediaId, status: "queued", url: null }); return true; }
      const status = options.noRendition && rendered && renditionPolls++ === 0 ? "queued" : "ready";
      await json(route, { items: rendered ? [{ ...ready, mediaId, status, url: status === "ready" ? photo : null }] : [], nextCursor: null }); return true;
    }
    if (path === "/admin/reviews") { current.latestReview = { ...review, status: "queued", result: null }; await json(route, current.latestReview); return true; }
    if (path === `/admin/reviews/${review.id}`) { current.latestReview = review; await json(route, review); return true; }
    if (path === `/admin/community-updates/${ids.update}/decisions`) {
      const input = route.request().postDataJSON();
      current.status = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "needs_evidence";
      current.revision += 1; await json(route, current); return true;
    }
    return false;
  } });
  await page.goto("/dashboard?view=admin-community");
  await expect(page.getByRole("heading", { name: "Sudah berkurang", exact: true })).toBeVisible();
  return { requests, current };
}
const decisions = (requests: Awaited<ReturnType<typeof fixtureApi>>) => requests.filter(request => request.path.endsWith("/decisions") && request.method === "POST");
async function openEvidence(page: Page) { await page.locator("summary").filter({ hasText: "Versi bukti dan izin publikasi" }).click(); }
const reason = (page: Page) => page.getByRole("textbox", { name: /Alasan\/catatan moderator/ });
const summary = (page: Page) => page.getByRole("textbox", { name: /Ringkasan untuk kronologi publik/ });

test("compact review preserves private evidence, human recommendations, and accessible enlargement", async ({ page }, testInfo) => {
  const { requests } = await setup(page);
  await expect(page.getByRole("heading", { name: "Bantuan keputusan" })).toBeVisible();
  await expect(page.getByText("EVIDENCE_CONFLICT", { exact: true })).toBeVisible();
  await expect(page.getByText(/Peringatan publikasi:/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Konfirmasi keputusan:/ })).toBeDisabled();
  await expect(summary(page)).toHaveValue("");
  await openEvidence(page);
  await expect(page.getByRole("checkbox", { name: "Izin web", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Izin Instagram", exact: true })).not.toBeChecked();
  await openEvidence(page);
  const expand = page.getByRole("button", { name: "Perbesar bukti 1", exact: true });
  await expand.click();
  await expect(page.getByRole("dialog", { name: "Pratinjau bukti privat" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(expand).toBeFocused();
  await page.getByRole("button", { name: "Salin ke kolom moderator" }).click();
  await expect(summary(page)).toHaveValue(review.result!.publicSummaryProposal!);
  expect(decisions(requests)).toHaveLength(0);
  await summary(page).fill("");
  await page.getByRole("heading", { name: "Sudah berkurang", exact: true }).click();
  const region = page.getByRole("region", { name: "Moderasi pembaruan komunitas", exact: true });
  await expect.poll(() => region.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await region.screenshot({ path: testInfo.outputPath("review-content.png") });
  await page.screenshot({ path: testInfo.outputPath("review-page.png"), fullPage: true });
});

test("approval sends only explicitly selected channels with revision and idempotency", async ({ page }) => {
  const { requests } = await setup(page);
  await openEvidence(page);
  await page.getByRole("checkbox", { name: "Izin web", exact: true }).check();
  await summary(page).fill("Kondisi terbaru telah ditinjau moderator.");
  await reason(page).fill("Foto dan kondisi telah diperiksa.");
  await page.getByRole("button", { name: "Konfirmasi keputusan: setujui pembaruan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Pembaruan disetujui");
  const [decision] = decisions(requests);
  expect(decision.body).toEqual({ action: "approve", reason: "Foto dan kondisi telah diperiksa.", publicSummary: "Kondisi terbaru telah ditinjau moderator.", publicEvidenceApprovals: [{ mediaId: ids.media, renditionId: ready.id, channels: ["web"] }], requestedEvidence: [] });
  expect(decision.revision).toBe("1"); expect(decision.key).toMatch(/^[\da-f-]{36}$/i);
  await expect(page.getByRole("button", { name: /Pembaruan kondisi Menunggu moderator/ })).toHaveCount(0);
});

for (const action of ["request_evidence", "reject"] as const) test(`${action} never publishes selected evidence or a public summary`, async ({ page }) => {
  const { requests } = await setup(page);
  await openEvidence(page);
  await page.getByRole("checkbox", { name: "Izin web", exact: true }).check();
  await page.getByRole("combobox", { name: "Tindakan", exact: true }).selectOption(action);
  if (action === "request_evidence") await page.getByRole("textbox", { name: /Bukti tambahan yang diminta/ }).fill("Foto terbaru\nLokasi yang sama\nWaktu pengamatan\nBukti keempat");
  await reason(page).fill("Data belum cukup untuk memastikan kondisi.");
  await page.getByRole("button", { name: /Konfirmasi keputusan:/ }).click();
  await expect.poll(() => decisions(requests).length).toBe(1);
  expect(decisions(requests)[0].body).toEqual({ action, reason: "Data belum cukup untuk memastikan kondisi.", publicSummary: null, publicEvidenceApprovals: [], requestedEvidence: action === "request_evidence" ? ["Foto terbaru", "Lokasi yang sama", "Waktu pengamatan"] : [] });
});

test("Hermes reruns and polling remain advice only", async ({ page }) => {
  const { requests } = await setup(page);
  await page.getByRole("button", { name: "Minta rekomendasi ulang" }).click();
  await expect(page.getByText("Hermes · queued", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Minta rekomendasi ulang" })).toBeDisabled();
  await expect(page.getByText("Hermes · completed", { exact: true })).toBeVisible();
  expect(requests.find(request => request.path === "/admin/reviews" && request.method === "POST")?.body).toEqual({ subjectType: "community_update", subjectId: ids.update, subjectRevision: 1 });
  expect(decisions(requests)).toHaveLength(0);
});

test("failed Hermes keeps manual decisions available and validates the reason", async ({ page }) => {
  const { requests } = await setup(page, { failed: true });
  await expect(page.getByText(/Keputusan manual tetap tersedia/)).toBeVisible();
  await page.getByRole("combobox", { name: "Tindakan", exact: true }).selectOption("reject");
  await reason(page).fill("abc");
  await expect(page.getByRole("button", { name: /Konfirmasi keputusan:/ })).toBeDisabled();
  await reason(page).fill("Bukti tidak sesuai dengan laporan.");
  await page.getByRole("button", { name: /Konfirmasi keputusan:/ }).click();
  await expect.poll(() => decisions(requests).length).toBe(1);
});

test("private drafts stay in page memory and invalidate on revision changes", async ({ page }) => {
  const { requests, current } = await setup(page, { second: true });
  await summary(page).fill("Draf privat untuk tes."); await reason(page).fill("Catatan moderator privat untuk tes.");
  await openEvidence(page); await page.getByRole("checkbox", { name: "Izin web", exact: true }).check();
  await page.getByRole("button", { name: "Simpan draf", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("selama halaman ini terbuka");
  await page.getByRole("button", { name: /Pembaruan lainnya/ }).click();
  await expect(page.getByRole("heading", { name: "Terlihat bersih", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Pembaruan kondisi Menunggu moderator/ }).click();
  await expect(summary(page)).toHaveValue("Draf privat untuk tes.");
  await expect(reason(page)).toHaveValue("Catatan moderator privat untuk tes.");
  await openEvidence(page); await expect(page.getByRole("checkbox", { name: "Izin web", exact: true })).not.toBeChecked();
  current.revision = 2; await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
  await expect(summary(page)).toHaveValue(""); await expect(reason(page)).toHaveValue("");
  expect(requests.filter(request => request.method !== "GET")).toHaveLength(0);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain("Catatan moderator privat untuk tes.");
});

test("queued rendition preparation preserves notes and never grants publication automatically", async ({ page }) => {
  const { requests } = await setup(page, { noRendition: true });
  await reason(page).fill("Catatan selama pratinjau disiapkan.");
  await openEvidence(page);
  await expect(page.getByRole("checkbox", { name: "Izin web", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Siapkan pratinjau bukti" }).click();
  // The refresh replaces the detail subtree; reopen the disclosure after the rendition becomes ready.
  await expect.poll(() => requests.filter(request => request.path.endsWith("/renditions") && request.method === "GET").length).toBeGreaterThan(2);
  await openEvidence(page);
  await expect(page.getByRole("combobox", { name: "Versi bukti", exact: true })).toHaveValue(ready.id);
  await expect(page.getByRole("checkbox", { name: "Izin web", exact: true })).not.toBeChecked();
  await expect(reason(page)).toHaveValue("Catatan selama pratinjau disiapkan.");
  const render = requests.find(request => request.method === "POST" && request.path.endsWith("/renditions"));
  expect(render?.body).toEqual({ subjectType: "community_update", subjectId: ids.update, redactions: [] });
  expect(render?.revision).toBe("1"); expect(decisions(requests)).toHaveLength(0);
});

test("all submitted photos remain reachable and changing the version clears its channels", async ({ page }) => {
  const { requests } = await setup(page, { multiple: true });
  await expect(page.getByRole("img", { name: /Bukti pembaruan komunitas/ })).toHaveCount(2);
  await openEvidence(page);
  await page.getByRole("checkbox", { name: "Izin web", exact: true }).nth(0).check();
  await page.getByRole("combobox", { name: "Versi bukti 1", exact: true }).selectOption("");
  await expect(page.getByRole("checkbox", { name: "Izin web", exact: true }).nth(0)).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Izin web", exact: true }).nth(0)).toBeDisabled();
  await openEvidence(page);
  await page.getByRole("button", { name: "Perbesar bukti 2", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
  expect(decisions(requests)).toHaveLength(0);
});
