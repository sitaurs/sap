import { expect, test } from "@playwright/test";

test("desktop footer leaf stays clear of legal links at common viewport widths", async ({ page }) => {
  await page.goto("/");
  await page.locator("#edukasi").scrollIntoViewIfNeeded();

  for (const width of [768, 1024, 1440, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    const leaf = page.locator("#edukasi > div:first-child > span[aria-hidden='true']");
    const links = ["Kebijakan Privasi", "Ketentuan Layanan", "Pengaturan Cookie"]
      .map((name) => page.getByRole("button", { name, exact: true }));
    await expect(leaf).toHaveCount(1);
    for (const link of links) await expect(link).toBeVisible();
    const leafBox = await leaf.boundingBox();
    expect(leafBox).not.toBeNull();
    for (const link of links) {
      const linkBox = await link.boundingBox();
      expect(linkBox).not.toBeNull();
      const overlaps = linkBox!.x < leafBox!.x + leafBox!.width &&
        linkBox!.x + linkBox!.width > leafBox!.x &&
        linkBox!.y < leafBox!.y + leafBox!.height &&
        linkBox!.y + linkBox!.height > leafBox!.y;
      expect(overlaps, `legal link overlaps leaf at ${width}px`).toBe(false);
    }
  }
});
