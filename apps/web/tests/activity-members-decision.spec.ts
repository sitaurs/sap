import { expect, test } from "@playwright/test";
import { fixtureApi, ids, json, managed, membership, time } from "./r1-fixtures";

test("accepted participant cancellation is unselected by default and requires confirmation", async ({ page }) => {
  const member = {
    ...membership,
    status: "accepted" as const,
    displayName: "Relawan diterima · TEST",
    createdAt: time,
  };
  const requests = await fixtureApi(page, {
    role: "admin",
    handler: async (route, path) => {
      if (path === `/activities/${ids.activity}/manage`) {
        await json(route, { ...managed, status: "registration_closed" });
        return true;
      }
      if (path === `/activities/${ids.activity}/memberships`) {
        await json(route, { items: [member], nextCursor: null });
        return true;
      }
      if (path === `/activities/${ids.activity}/memberships/${member.id}`) {
        await json(route, { ...member, revision: 2, status: "cancelled" });
        return true;
      }
      return false;
    },
  });

  await page.goto(`/dashboard?view=admin-activities&activityScreen=members&activity=${ids.activity}`);
  await page.getByRole("button", { name: /Relawan diterima/ }).click();
  const decision = page.getByLabel("Status baru");
  await expect(decision).toHaveValue("");
  await expect(decision.locator("option:checked")).toHaveText("Pilih keputusan");

  await decision.selectOption("cancelled");
  await page.getByLabel("Alasan keputusan").fill("Peserta meminta pembatalan keikutsertaan.");
  await page.getByRole("button", { name: "Simpan keputusan", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByText("Batalkan peserta yang diterima?")).toBeVisible();
  expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);

  await confirmation.getByRole("button", { name: "Kembali" }).click();
  await expect(confirmation).toHaveCount(0);
  expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);

  await page.getByRole("button", { name: "Simpan keputusan", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Ya, batalkan peserta" }).click();
  await expect.poll(() => requests.filter((request) => request.method === "PATCH").length).toBe(1);
  expect(requests.find((request) => request.method === "PATCH")?.body).toEqual({
    status: "cancelled",
    reason: "Peserta meminta pembatalan keikutsertaan.",
  });
});
