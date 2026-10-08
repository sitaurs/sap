import { expect, test } from "@playwright/test";
import { fixtureApi, json } from "./r1-fixtures";

test("admin-community opens the moderator queue instead of report moderation", async ({ page }) => {
  await fixtureApi(page, {
    role: "admin",
    handler: async (route, path) => {
      if (path !== "/admin/review-queue") return false;
      await json(route, { items: [], nextCursor: null });
      return true;
    },
  });

  await page.goto("/dashboard?view=admin-community");

  await expect(page.getByRole("heading", { name: "Tinjau pembaruan warga" })).toBeVisible();
  await expect(page.getByLabel("Antrean pembaruan")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page).toHaveURL(/view=admin-community/);
});
