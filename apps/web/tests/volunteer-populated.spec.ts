import { expect, test } from "@playwright/test";
import { activityView, fixtureApi, json, membership } from "./r1-fixtures";
import { populatedActivities, populatedAssignments, populatedRegistrations } from "./volunteer-populated-fixtures";

for (const locale of ["id", "en"] as const) {
  test(`closed public activity shows a human registration reason in ${locale}`, async ({ page }) => {
    const publicActivity = { ...populatedActivities[0], status: "registration_closed" as const, registrationOpen: false, registrationClosedReason: "manually_closed" as const };
    await page.context().addCookies([{ name: "sap_locale", value: locale, url: test.info().project.use.baseURL as string }]);
    const requests = await fixtureApi(page, { handler: async (route, path) => {
      if (path === "/activities") { await json(route, { items: [publicActivity], nextCursor: null }); return true; }
      if (path === `/activities/${publicActivity.id}`) { await json(route, publicActivity); return true; }
      if (path === `/activities/${publicActivity.id}/viewer`) {
        await json(route, { ...activityView, activityId: publicActivity.id, actions: { ...activityView.actions, join: { allowed: false, reasonCode: "REGISTRATION_CLOSED" } } });
        return true;
      }
      return false;
    } });
    await page.goto("/dashboard?view=activities");
    await page.getByRole("region", { name: locale === "en" ? "Public activities" : "Kegiatan publik" })
      .getByRole("button", { name: new RegExp(publicActivity.title) }).click();
    const dialog = page.getByRole("dialog", { name: locale === "en" ? "Volunteer activity details" : "Detail kegiatan relawan" });
    await expect(dialog.getByText(locale === "en" ? "Registration has closed." : "Pendaftaran telah ditutup.", { exact: true })).toBeVisible();
    await expect(dialog).not.toContainText("REGISTRATION_CLOSED");
    expect(requests.every(request => request.method === "GET")).toBe(true);
  });
}

test("populated workspace shows API statuses, consistent times, and private meeting points only in detail", async ({ page }, testInfo) => {
  const accepted = populatedRegistrations[0].activity;
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/activities") { await json(route, { items: populatedActivities, nextCursor: null }); return true; }
    if (path === "/users/me/activities") { await json(route, { items: [{ ...populatedRegistrations[0], isCoordinator: true }, ...populatedRegistrations.slice(1)], nextCursor: null }); return true; }
    if (path === "/users/me/coordinator-assignments") { await json(route, { items: populatedAssignments, nextCursor: null }); return true; }
    if (path === `/activities/${accepted.id}`) { await json(route, accepted); return true; }
    if (path === `/activities/${accepted.id}/viewer`) { await json(route, { ...activityView, membership: { ...membership, status: "accepted" }, meetingPoint: { instructions: "Titik kumpul privat · TEST", latitude: null, longitude: null } }); return true; }
    if (path === `/activities/${accepted.id}/source-photo`) { await json(route, { url: null, expiresAt: null }); return true; }
    return false;
  } });
  await page.goto("/dashboard?view=activities");
  const mine = page.getByRole("region", { name: "Pendaftaran saya", exact: true });
  await expect(mine.getByRole("article")).toHaveCount(3);
  await expect(mine.getByText("Anda sudah diterima sebagai peserta.", { exact: true })).toBeVisible();
  await expect(mine.getByText("Permintaan terkirim. Anda belum menjadi peserta.", { exact: true })).toBeVisible();
  await expect(mine.getByText("Anda berada dalam daftar cadangan.", { exact: true })).toBeVisible();
  await expect(mine.getByRole("button", { name: "Lihat detail & titik kumpul" })).toHaveCount(1);
  await expect(mine.getByRole("button", { name: "Lihat kegiatan", exact: true })).toHaveCount(2);
  const assignmentSection = page.getByRole("region", { name: "Penugasan koordinator", exact: true });
  await expect(assignmentSection.getByRole("article")).toHaveCount(2);
  await expect(assignmentSection.getByText("1 perlu konfirmasi")).toBeVisible();
  await expect(assignmentSection.getByRole("checkbox")).not.toBeChecked();
  await expect(assignmentSection.getByRole("button", { name: "Kelola kegiatan" })).toBeVisible();
  await expect(page.getByText("Titik kumpul privat · TEST", { exact: true })).toHaveCount(0);
  const publicTree = page.getByRole("region", { name: "Kegiatan publik", exact: true }).getByRole("button", { name: /Penanaman pohon bersama/ });
  const myTree = mine.getByRole("article", { name: "Penanaman pohon bersama" });
  await expect(publicTree.locator("time")).toHaveAttribute("datetime", populatedActivities[1].startsAt!);
  await expect(myTree.locator("time")).toHaveAttribute("datetime", populatedActivities[1].startsAt!);
  await expect(page.getByText("DATA CONTOH · MOCKUP")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("workspace-populated.png"), fullPage: true });
  await mine.getByRole("button", { name: "Lihat detail & titik kumpul" }).click();
  await expect(page.getByRole("dialog").getByText("Titik kumpul privat · TEST", { exact: true })).toBeVisible();
  expect(requests.filter(request => request.method !== "GET")).toHaveLength(0);
});

test("accepting without name consent isolates each assignment and preserves the submitted revision", async ({ page }) => {
  const first = { ...populatedAssignments[0], revision: 7 };
  const second = { ...populatedAssignments[1], coordinatorAcceptedAt: null };
  let accepted = false;
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/users/me/coordinator-assignments") { await json(route, { items: [{ ...first, coordinatorAcceptedAt: accepted ? "2026-10-09T01:00:00Z" : null }, second], nextCursor: null }); return true; }
    if (path === `/activities/${first.id}/coordinator-acceptance`) { accepted = true; await json(route, { ...first, revision: 8, coordinatorAcceptedAt: "2026-10-09T01:00:00Z" }); return true; }
    return false;
  } });
  await page.goto("/dashboard?view=activities");
  const firstCard = page.getByRole("article", { name: first.title });
  const secondCard = page.getByRole("article", { name: second.title });
  await expect(firstCard.getByRole("checkbox")).not.toBeChecked();
  await secondCard.getByRole("checkbox").check();
  await firstCard.getByRole("button", { name: "Terima penugasan", exact: true }).click();
  await expect(firstCard.getByRole("button", { name: "Kelola kegiatan" })).toBeVisible();
  await expect(secondCard.getByRole("checkbox")).toBeChecked();
  const mutation = requests.find(request => request.method === "PUT");
  expect(mutation?.body).toEqual({ accepted: true, publishDisplayName: false });
  expect(mutation?.revision).toBe("7");
});

test("unavailable and terminal records show truthful states at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/users/me/activities") { await json(route, { items: [
      { ...populatedRegistrations[0], activity: { ...populatedActivities[2], title: "Selesai · TEST" } },
      { ...populatedRegistrations[1], membership: { ...membership, status: "rejected", reason: "Kuota telah penuh · TEST" } },
      { ...populatedRegistrations[2], activity: { kind: "activity_notice", id: populatedRegistrations[2].activity.id, reportId: null, message: "Sumber kegiatan tidak tersedia · TEST", cancellationReason: "Dibatalkan pengelola · TEST" } },
    ], nextCursor: null }); return true; }
    if (path === "/users/me/coordinator-assignments") { await json(route, { items: [{ ...populatedAssignments[0], status: "cancelled" }], nextCursor: null }); return true; }
    return false;
  } });
  await page.goto("/dashboard?view=activities");
  await expect(page.getByText("Kuota telah penuh · TEST")).toBeVisible();
  await expect(page.getByText("Sumber kegiatan tidak tersedia · TEST")).toBeVisible();
  await expect(page.getByText("Penugasan berakhir", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lihat detail & titik kumpul" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Terima penugasan" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /Izinkan nama tampilan/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(requests.filter(request => request.method !== "GET")).toHaveLength(0);
});
