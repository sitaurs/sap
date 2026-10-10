import { expect, test } from "@playwright/test";
import { activity, activityView, fixtureApi, ids, json, managed, membership } from "./r1-fixtures";

const displayedActivities = [
  { ...activity, title: "QA TEST: Aksi bersih sampah organik", status: "registration_open", registrationOpen: false, registrationClosedReason: "deadline_passed", registrationClosesAt: "2026-10-07T16:59:00Z", area: { cellId: "test-area-1", label: "Area 898d85c2097ffff" }, capacity: 5, availableSeats: 4, startsAt: "2026-10-08T01:00:00Z" },
  { ...activity, id: "00000003-1000-4000-8000-000000000004", title: "Penyelesaian kegiatan", status: "completed", registrationOpen: false, area: { cellId: "test-area-2", label: "Area 898c106a48fffff" }, capacity: 1, availableSeats: 1, startsAt: "2026-10-05T06:28:00Z" },
  { ...activity, id: "00000003-1000-4000-8000-000000000005", title: "Kegiatan penanganan sampah", status: "completed", registrationOpen: false, area: { cellId: "test-area-2", label: "Area 898c106a48fffff" }, capacity: 1, availableSeats: 0, startsAt: "2026-10-05T04:28:00Z" },
  { ...activity, id: "00000003-1000-4000-8000-000000000006", title: "Kegiatan yang dibatalkan", status: "cancelled", registrationOpen: false, area: { cellId: "test-area-2", label: "Area 898c106a48fffff" }, capacity: 2, availableSeats: 2, startsAt: "2026-10-05T03:58:00Z" },
];

test("workspace keeps activity statuses, empty sections, and detail navigation", async ({ page }, testInfo) => {
  const requests = await fixtureApi(page, { role: "admin", handler: async (route, path) => {
    if (path === "/activities") { await json(route, { items: displayedActivities, nextCursor: null }); return true; }
    if (path === `/activities/${ids.activity}`) { await json(route, displayedActivities[0]); return true; }
    return false;
  } });
  await page.goto("/dashboard?view=activities");
  const workspace = page.getByRole("region", { name: "Ruang relawan", exact: true });
  await expect(workspace.getByRole("heading", { name: "Belum ada pendaftaran" })).toBeVisible();
  await expect(workspace.getByRole("heading", { name: "Belum ada penugasan" })).toBeVisible();
  const publicSection = workspace.getByRole("region", { name: "Kegiatan publik", exact: true });
  await expect(publicSection.getByRole("button")).toHaveCount(4);
  await expect(publicSection.getByText("Pendaftaran ditutup", { exact: true })).toBeVisible();
  await expect(publicSection.getByText("Selesai", { exact: true })).toHaveCount(2);
  await expect(publicSection.getByText("Dibatalkan", { exact: true })).toBeVisible();
  await expect(publicSection.getByRole("link", { name: "Lihat semua kegiatan" })).toHaveAttribute("href", "/activities");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => workspace.locator("img").evaluateAll(images => images.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)), { timeout: 30_000 }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("workspace-empty.png"), fullPage: true });
  await workspace.screenshot({ path: testInfo.outputPath("workspace-content.png") });
  await publicSection.getByRole("button", { name: /QA TEST: Aksi bersih sampah organik/ }).focus();
  await expect(publicSection.getByRole("button", { name: /QA TEST: Aksi bersih sampah organik/ })).toBeFocused();
  await publicSection.getByRole("button", { name: /QA TEST: Aksi bersih sampah organik/ }).click();
  const dialog = page.getByRole("dialog", { name: "Detail kegiatan relawan" });
  await expect(dialog.getByRole("heading", { name: displayedActivities[0].title })).toBeVisible();
  await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests.filter(request => request.method !== "GET")).toHaveLength(0);
});

test("requesting participation stays pending and preserves existing registrations", async ({ page }) => {
  let joined = false;
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/users/me/activities") { await json(route, { items: joined ? [{ activity, membership, isCoordinator: false }] : [], nextCursor: null }); return true; }
    if (path === `/activities/${ids.activity}/membership`) { joined = true; await json(route, membership); return true; }
    if (path === `/activities/${ids.activity}/viewer`) { await json(route, { ...activityView, membership: joined ? membership : null, actions: { ...activityView.actions, join: { allowed: !joined, reasonCode: null }, cancelMembership: { allowed: joined, reasonCode: null } } }); return true; }
    return false;
  } });
  await page.goto("/dashboard?view=activities");
  await page.getByRole("button", { name: /Bersih taman · TEST/ }).click();
  await page.getByRole("button", { name: "Ajukan untuk bergabung", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Pendaftaran Anda: Menunggu")).toBeVisible();
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(page.getByRole("region", { name: "Pendaftaran saya", exact: true }).getByLabel("Status: Menunggu", { exact: true })).toBeVisible();
  expect(requests.find(request => request.method === "PUT")?.body).toEqual({ participating: true });
});

test("pending registration remains visible when the same user coordinates the activity", async ({ page }) => {
  await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/users/me/activities") {
      await json(route, { items: [{ activity, membership, isCoordinator: true }], nextCursor: null });
      return true;
    }
    return false;
  } });

  await page.goto("/dashboard?view=activities");
  const registrations = page.getByRole("region", { name: "Pendaftaran saya", exact: true });
  await expect(registrations).toContainText("1");
  await expect(registrations.getByLabel("Status: Menunggu", { exact: true })).toBeVisible();
  await expect(registrations.getByRole("heading", { name: activity.title })).toBeVisible();
});

test("accepting coordinator assignment preserves explicit consent and revision", async ({ page }) => {
  let accepted = false;
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/users/me/coordinator-assignments") { await json(route, { items: [{ ...managed, coordinatorAcceptedAt: accepted ? "2026-10-08T01:00:00Z" : null }], nextCursor: null }); return true; }
    if (path === `/activities/${ids.activity}/coordinator-acceptance`) { accepted = true; await json(route, { ...managed, coordinatorAcceptedAt: "2026-10-08T01:00:00Z", revision: 2 }); return true; }
    return false;
  } });
  await page.goto("/dashboard?view=activities");
  const consent = page.getByRole("checkbox", { name: /Izinkan nama tampilan saya/ });
  await expect(consent).not.toBeChecked();
  await consent.check();
  await page.getByRole("button", { name: "Terima penugasan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kelola kegiatan", exact: true })).toBeVisible();
  const acceptance = requests.find(request => request.method === "PUT");
  expect(acceptance?.body).toEqual({ accepted: true, publishDisplayName: true });
  expect(acceptance?.revision).toBe("1");
});

test("declining coordinator assignment never publishes the display name", async ({ page }) => {
  let declined = false;
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/users/me/coordinator-assignments") { await json(route, { items: declined ? [] : [managed], nextCursor: null }); return true; }
    if (path === `/activities/${ids.activity}/coordinator-acceptance`) { declined = true; await json(route, { ...managed, revision: 2 }); return true; }
    return false;
  } });
  await page.goto("/dashboard?view=activities");
  await page.getByRole("checkbox", { name: /Izinkan nama tampilan saya/ }).check();
  await page.getByRole("button", { name: "Tolak penugasan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Belum ada penugasan", exact: true })).toBeVisible();
  expect(requests.find(request => request.method === "PUT")?.body).toEqual({ accepted: false, publishDisplayName: false });
});
