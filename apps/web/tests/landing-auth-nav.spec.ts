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
