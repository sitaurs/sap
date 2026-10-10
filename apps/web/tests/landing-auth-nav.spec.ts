import { expect, test } from "@playwright/test";
import { fixtureApi } from "./r1-fixtures";

test("authenticated landing users get one dashboard action", async ({ page }) => {
  await fixtureApi(page);
  await page.goto("/");

  const banner = page.getByRole("banner");
  const dashboardLink = banner.getByRole("link", { name: "Ke Dashboard" });
  await expect(dashboardLink).toBeVisible();
  await expect(banner.getByRole("link", { name: "Masuk", exact: true })).toHaveCount(0);
  await expect(banner.getByRole("link", { name: "Coba Sekarang", exact: true })).toHaveCount(0);
  if (test.info().project.name === "mobile") {
    await page.getByRole("button", { name: "Buka menu" }).click();
    const menu = page.getByRole("dialog", { name: "Jelajahi SAP" });
    await expect(menu.getByRole("link", { name: "Ke Dashboard", exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Masuk", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Coba Sekarang", exact: true })).toHaveCount(0);
    await menu.getByRole("button", { name: "Tutup menu" }).click();
  }
  await dashboardLink.click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("guest landing users retain sign-in and sign-up actions", async ({ page }) => {
  await fixtureApi(page, { guest: true });
  await page.goto("/");

  const banner = page.getByRole("banner");
  if (test.info().project.name === "mobile") {
    await page.getByRole("button", { name: "Buka menu" }).click();
    const menu = page.getByRole("dialog", { name: "Jelajahi SAP" });
    await expect(menu.getByRole("link", { name: "Masuk", exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Coba Sekarang", exact: true })).toBeVisible();
  } else {
    await expect(banner.getByRole("link", { name: "Masuk", exact: true })).toBeVisible();
    await expect(banner.getByRole("link", { name: "Coba Sekarang", exact: true })).toBeVisible();
  }
  await expect(banner.getByRole("link", { name: "Ke Dashboard", exact: true })).toHaveCount(0);
});

test("landing navbar controls fit inside the floating bar and share its vertical center", async ({ page }) => {
  await fixtureApi(page);
  await page.goto("/");

  const banner = page.getByRole("banner");
  const bar = banner.locator(":scope > div");
  const brand = bar.getByRole("link", { name: "SAP Sustainable AI Platform" });
  const nav = bar.getByRole("navigation", { name: "Navigasi utama" });
  const actions = bar.locator(":scope > div").last();
  const menu = bar.getByRole("button", { name: "Buka menu" });
  const barBox = await bar.boundingBox();

  expect(barBox).not.toBeNull();
  const visibleItems = [brand, actions];
  if (await nav.isVisible()) visibleItems.push(nav);
  if (await menu.isVisible()) visibleItems.push(menu);

  for (const item of visibleItems) {
    const box = await item.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(barBox!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(barBox!.x + barBox!.width);
    expect(Math.abs(box!.y + box!.height / 2 - (barBox!.y + barBox!.height / 2))).toBeLessThanOrEqual(2);
  }

  if (await nav.isVisible()) {
    const current = nav.locator('[aria-current="location"]');
    const hoverTarget = nav.getByRole("link", { name: "Peta Laporan" });
    await hoverTarget.hover();
    await expect(current).toHaveCount(1);
    const activeBackground = await current.evaluate(element => getComputedStyle(element).backgroundColor);
    const hoverBackground = await hoverTarget.evaluate(element => getComputedStyle(element).backgroundColor);
    expect(hoverBackground).not.toBe(activeBackground);
  }
});

test("direct login visit redirects an existing session to the dashboard", async ({ page }) => {
  await fixtureApi(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("guest can still use the login page", async ({ page }) => {
  await fixtureApi(page, { guest: true });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});
