import { expect, test, type Page } from "@playwright/test";
import { fixtureApi, ids, json } from "./r1-fixtures";

type MotionLog = { path: string; view: string | null; kind: string | null; tag: string }[];
async function recordMotion(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as { sapMotionLog: MotionLog };
    state.sapMotionLog = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element["animate"]>) {
      const animation = Reflect.apply(original, this, args) as Animation;
      const node = this as HTMLElement;
      if (node.closest("[data-motion-scope]") || node.hasAttribute("data-motion")) {
        state.sapMotionLog.push({ path: location.pathname,
          view: node.closest("[data-motion-view]")?.getAttribute("data-motion-view") ?? null,
          kind: node.dataset.motion ?? null, tag: node.tagName });
      }
      return animation;
    };
  });
}
async function log(page: Page) {
  return page.evaluate(() => (window as unknown as { sapMotionLog: MotionLog }).sapMotionLog);
}
async function adminFixture(page: Page) {
  return fixtureApi(page, { role: "admin", handler: async (route, path) => {
    if (path === "/users/me/stats") {
      await json(route, { totalScans: 24, classifiedScans: 24, ecoPoints: 120,
        streakDays: 3, verifiedReports: 0, resolvedReports: 0, categoryCounts: [] }); return true;
    }
    if (["/admin/reports", "/admin/audit", "/admin/audit-events", "/admin/review-queue"].includes(path)) {
      await json(route, { items: [], nextCursor: null }); return true;
    }
    if (path === "/admin/stats") {
      await json(route, { submittedReports: 4, verifiedReports: 3, inProgressReports: 2,
        resolvedReports: 1, oldestPendingAt: null }); return true;
    }
    return false;
  } });
}

test("entries cover public, auth, dashboard and every admin view without sending actions", async ({ page }) => {
  await recordMotion(page);
  const requests = await adminFixture(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const paths = ["/", "/login", "/signup", "/incidents", `/incidents/${ids.incident}`,
    "/activities", `/activities/${ids.activity}`, `/activities/${ids.activity}/manage`,
    "/dashboard", ...["scan", "reports", "activities", "map", "history", "achievements", "settings", "help",
      "admin-moderation", "admin-community", "admin-activities", "admin-impact", "admin-settings", "admin-instagram"]
      .map(view => `/dashboard?view=${view}`)];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect.poll(async () => (await log(page)).length, { message: `Entry on ${path}` }).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  expect(errors).toEqual([]);
  expect(requests.filter(request => !["GET", "HEAD"].includes(request.method))).toEqual([]);
});

test("counters keep the actual accessible value and settle, search does not replay entries", async ({ page }) => {
  await recordMotion(page);
  await adminFixture(page);
  await page.goto("/dashboard");
  const card = page.getByRole("button", { name: /Total scan/ });
  await expect(card).toHaveAccessibleName(/24/);
  await expect(card.locator(".sap-motion-number-value")).toHaveText("24");
  await expect(page.locator(".sap-motion-number-value").nth(2)).toHaveText("120");
  const before = (await log(page)).filter(entry => entry.view === "dashboard" && entry.kind === "card").length;
  if (test.info().project.name === "mobile") await page.getByRole("button", { name: "Buka pencarian", exact: true }).click();
  await page.getByRole("searchbox", { name: "Cari laporan atau area" }).fill("tetap fokus");
  await expect(page.getByRole("searchbox", { name: "Cari laporan atau area" })).toBeFocused();
  await expect(page.getByRole("searchbox", { name: "Cari laporan atau area" })).toHaveValue("tetap fokus");
  expect((await log(page)).filter(entry => entry.view === "dashboard" && entry.kind === "card").length).toBe(before);
});

test("reduced motion disables entries and count-up, including a live preference change", async ({ page }) => {
  await recordMotion(page);
  await adminFixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Total scan/ }).locator(".sap-motion-number-value")).toHaveText("24");
  expect(await log(page)).toEqual([]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/dashboard?view=admin-moderation");
  await expect(page.getByRole("heading", { name: "Moderasi laporan", exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.id === "sap-entry").length)).toBe(0);
  await expect(page.locator(".sap-motion-number-value").first()).toHaveText("4");
});

test("login form survives motion and stage changes without clearing entered email", async ({ page }) => {
  await fixtureApi(page, { guest: true });
  await page.goto("/login");
  const email = page.getByLabel("Email", { exact: true });
  await email.fill("motion-check@example.invalid");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(email).toBeFocused();
  await expect(email).toHaveValue("motion-check@example.invalid");
  await page.getByRole("button", { name: /Lupa kata sandi/ }).click();
  await expect(page.getByRole("heading", { name: "Lupa kata sandi?" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("motion-check@example.invalid");
});

test("landing and auth content remain visible without JavaScript", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: testInfo.project.use.viewport });
  const page = await context.newPage();
  for (const path of ["/", "/login", "/signup"]) {
    await page.goto(`${testInfo.project.use.baseURL}${path}`);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.locator("h1").evaluate(element => getComputedStyle(element).opacity)).toBe("1");
  }
  await context.close();
});
