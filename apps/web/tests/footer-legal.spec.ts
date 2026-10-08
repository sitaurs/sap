import { expect, test } from "@playwright/test";

test("footer privacy and terms links open readable review drafts", async ({ page }) => {
  await page.goto("/");

  for (const [label, section] of [
    ["Kebijakan Privasi", "Data yang diproses"],
    ["Ketentuan Layanan", "Akun dan penggunaan yang wajar"],
  ] as const) {
    await page.locator("#edukasi").getByRole("button", { name: label, exact: true }).filter({ visible: true }).click();
    const dialog = page.getByRole("dialog", { name: label });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("note")).toContainText("DRAF UNTUK DITINJAU");
    await expect(dialog.getByRole("heading", { name: section, exact: true })).toBeVisible();
    await expect(dialog).toContainText("pengelola");
    await dialog.getByRole("button", { name: "Tutup detail" }).click();
  }
});
