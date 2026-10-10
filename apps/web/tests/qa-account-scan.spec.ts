import { expect, test, type Page } from "@playwright/test";
import type { SapReport } from "../lib/api/client";
import { fixtureApi, future, ids, json, time, user } from "./r1-fixtures";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=", "base64");
const photo = { name: "waste.png", mimeType: "image/png", buffer: png };

async function english(page: Page) {
  await page.context().addCookies([{ name: "sap_locale", value: "en", url: test.info().project.use.baseURL ?? "http://localhost:3000" }]);
}

test("invalid scan files have explicit feedback, never upload, and allow a valid replacement", async ({ page }) => {
  const requests = await fixtureApi(page);
  await page.goto("/dashboard?view=scan");
  const input = page.locator('input[type="file"][aria-label="Unggah foto dari perangkat"]');
  await expect(input).toBeHidden();
  const invalid = [
    { file: { name: "picture.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') }, message: "Format file tidak didukung. Pilih foto JPG, PNG, atau WebP." },
    { file: { name: "script.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>window.qaScriptExecuted=true</script></svg>') }, message: "Format file tidak didukung. Pilih foto JPG, PNG, atau WebP." },
    { file: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") }, message: "Format file tidak didukung. Pilih foto JPG, PNG, atau WebP." },
    { file: { name: "large.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(12 * 1024 * 1024) }, message: "Ukuran foto melebihi 10 MB. Pilih foto yang lebih kecil." },
  ];
  for (const { file, message } of invalid) {
    await input.setInputFiles(photo);
    await expect(page.getByRole("button", { name: "Pindai dengan AI" })).toBeEnabled();
    await input.setInputFiles(file);
    await expect(page.locator('p[role="alert"]')).toHaveText(message);
    await expect(page.getByRole("button", { name: "Pindai dengan AI" })).toHaveCount(0);
    await expect(page.getByText(file.name, { exact: true })).toHaveCount(0);
    // Re-selecting the same rejected file must still give feedback.
    await input.setInputFiles(file);
    await expect(page.locator('p[role="alert"]')).toHaveText(message);
  }
  expect(await page.evaluate(() => "qaScriptExecuted" in window)).toBe(false);
  expect(requests.filter(request => request.method === "POST")).toEqual([]);
  for (const valid of [
    photo,
    { name: "waste.jpg", mimeType: "image/jpeg", buffer: png },
    { name: "waste.webp", mimeType: "image/webp", buffer: png },
  ]) {
    await input.setInputFiles(valid);
    await expect(page.locator('p[role="alert"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pindai dengan AI" })).toBeEnabled();
    await expect(page.getByText(valid.name, { exact: true })).toBeVisible();
  }
});

test("English scan prompts, rejection, and material labels stay translated", async ({ page }) => {
  await english(page);
  await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/categories") { await json(route, { items: [{ id: "plastic", name: "Plastik" }], nextCursor: null }); return true; }
    if (path === "/media") { await json(route, { id: ids.media }); return true; }
    if (path === "/scans" && route.request().method() === "POST") {
      await json(route, { id: ids.operation, status: "succeeded", outcome: "classified", categoryId: "plastic", predictions: [], pointsAwarded: 10, createdAt: time, completedAt: time, errorCode: null }); return true;
    }
    return false;
  } });
  await page.goto("/dashboard?view=scan");
  await expect(page.getByText("Take a photo or upload an image")).toBeVisible();
  const input = page.locator('input[type="file"][aria-label="Upload a photo from your device"]');
  await expect(input).toBeHidden();
  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
  await expect(page.locator('p[role="alert"]')).toHaveText("Unsupported file type. Choose a JPG, PNG, or WebP photo.");
  await input.setInputFiles(photo);
  await page.getByRole("button", { name: "Scan with AI" }).click();
  await expect(page.getByRole("heading", { name: "Scan result", exact: true })).toBeVisible();
  await expect(page.getByText("Plastic", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Heater", { exact: true })).toHaveCount(0);
});

test("English scan upload button opens the native picker from the keyboard", async ({ page }) => {
  await english(page);
  await fixtureApi(page);
  await page.goto("/dashboard?view=scan");

  const upload = page.getByRole("button", { name: "Upload photo", exact: true });
  const input = page.locator('input[type="file"][aria-label="Upload a photo from your device"]');
  await expect(input).toBeHidden();
  await expect(upload).toBeVisible();
  await upload.focus();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  const chooser = await chooserPromise;
  await chooser.setFiles(photo);

  await expect(page.getByText(photo.name, { exact: true })).toBeVisible();
});

test("a slow scan explains that its result is still checked automatically", async ({ page }) => {
  await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/media") { await json(route, { id: ids.media }); return true; }
    if (path === "/scans" && route.request().method() === "POST") {
      await json(route, { id: ids.operation, status: "queued", outcome: null, categoryId: null, predictions: [], pointsAwarded: 0, createdAt: time, completedAt: null, errorCode: null }); return true;
    }
    if (path === `/scans/${ids.operation}`) {
      await json(route, { id: ids.operation, status: "processing", outcome: null, categoryId: null, predictions: [], pointsAwarded: 0, createdAt: time, completedAt: null, errorCode: null }); return true;
    }
    return false;
  } });
  await page.goto("/dashboard?view=scan");
  await page.locator('input[type="file"][aria-label="Unggah foto dari perangkat"]').setInputFiles(photo);
  await page.getByRole("button", { name: "Pindai dengan AI" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pemindaian masih berlangsung." })).toBeVisible({ timeout: 15_000 });
});

test("English help searches and displays translated FAQ questions and answers", async ({ page }) => {
  await english(page);
  await fixtureApi(page);
  await page.goto("/dashboard?view=help");
  await page.getByRole("searchbox", { name: "Search help" }).fill("What if location access is denied");
  await page.getByRole("button", { name: "What if location access is denied?" }).click();
  await expect(page.getByText("Click the map or drag the pin to select a location manually, then confirm it.")).toBeVisible();
  await expect(page.getByText("Bagaimana jika GPS ditolak?", { exact: true })).toHaveCount(0);
});

test("English report review translates the pile label and keeps spaces between facts", async ({ page }) => {
  await english(page);
  await fixtureApi(page);
  await page.goto("/dashboard?view=reports");
  await page.getByRole("button", { name: "Create report", exact: true }).click();
  await page.getByLabel("Choose up to three evidence photos").setInputFiles(photo);
  await page.getByRole("radio", { name: "Large Large area" }).check();
  await page.getByRole("textbox", { name: /Description/ }).fill("Synthetic waste found in a public park, with clear photo evidence.");
  await page.getByRole("button", { name: "Continue to location" }).click();
  await page.locator(".leaflet-container").click({ position: { x: 120, y: 100 } });
  await page.getByRole("button", { name: "Confirm pin" }).click();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByText("Pile size Large", { exact: true })).toBeVisible();
  await expect(page.getByText("Pile size: Large", { exact: true })).toBeVisible();
  await expect(page.getByText("Pile size besar", { exact: true })).toHaveCount(0);
});

const report: SapReport = {
  id: ids.incident, revision: 1, status: "submitted", categoryId: "plastic", scanId: null,
  description: "Synthetic report with enough detail to verify translated pile labels.",
  reportedSeverity: "large", location: { latitude: -7.98, longitude: 112.63 },
  occurredAt: time, createdAt: time, updatedAt: time, mediaIds: [], resolutionMediaIds: [],
  publicSummary: null, publishedMediaIds: [], duplicateOfId: null, timeline: [],
};
for (const locale of ["id", "en"] as const) {
  test(`report detail uses a readable pile label in ${locale}`, async ({ page }) => {
    if (locale === "en") await english(page);
    await fixtureApi(page, { handler: async (route, path) => {
      if (path === "/categories") { await json(route, { items: [{ id: "plastic", name: "Plastik" }], nextCursor: null }); return true; }
      if (path === "/reports/mine") { await json(route, { items: [report], nextCursor: null }); return true; }
      if (path === `/reports/${report.id}`) { await json(route, report); return true; }
      return false;
    } });
    await page.goto("/dashboard?view=reports");
    await page.getByRole("button", { name: locale === "id" ? /Lihat detail laporan/ : /View report details/ }).click();
    await expect(page.getByRole("dialog").getByText(locale === "id" ? "Plastik · Tumpukan Besar" : "Plastic · Pile size Large", { exact: true })).toBeVisible();
  });
}

test("first login click succeeds even when remembering an email is unavailable", async ({ page }) => {
  let authenticated = false;
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/auth/me") {
      if (authenticated) await json(route, user);
      else await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }) });
      return true;
    }
    if (path === "/auth/login") { authenticated = true; await json(route, user); return true; }
    return false;
  } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    for (const name of ["getItem", "setItem", "removeItem"] as const) {
      const original = Storage.prototype[name];
      Storage.prototype[name] = function (key: string, ...args: string[]) {
        if (key === "sap-remembered-email") throw new DOMException("Storage disabled", "SecurityError");
        return Reflect.apply(original, this, [key, ...args]);
      };
    }
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("qa@gmail.com");
  await page.getByLabel("Kata sandi", { exact: true }).fill("synthetic-password");
  await page.getByLabel("Ingat email saya").check();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  expect(requests.filter(request => request.path === "/auth/login")).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("autofilled credentials submit once when two submit events arrive together", async ({ page }) => {
  let authenticated = false;
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/auth/me") {
      if (authenticated) await json(route, user);
      else await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }) });
      return true;
    }
    if (path === "/auth/login") { authenticated = true; await json(route, user); return true; }
    return false;
  } });
  await page.goto("/login");
  await page.getByLabel("Kata sandi", { exact: true }).fill("initial-value");
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(document.querySelector("#auth-email"), "autofilled@gmail.com");
    setter.call(document.querySelector("#auth-password"), "autofilled-password");
    const form = document.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect(page).toHaveURL(/\/dashboard$/);
  const logins = requests.filter(request => request.path === "/auth/login");
  expect(logins).toHaveLength(1);
  expect(logins[0].body).toEqual({ email: "autofilled@gmail.com", password: "autofilled-password" });
});

test("reserved signup domains stay on the form, then a corrected address can register", async ({ page }) => {
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/auth/register") { await json(route, { challengeId: ids.operation, message: "Kode verifikasi dikirim.", expiresAt: future }); return true; }
    return false;
  } });
  await page.goto("/signup");
  await page.getByLabel("Nama lengkap", { exact: true }).fill("Synthetic User");
  await page.getByLabel("Kata sandi", { exact: true }).fill("synthetic-password");
  for (const domain of ["contohpalsu.test", "invalid.invalid", "demo.example", "mail.localhost", "localhost"]) {
    await page.getByLabel("Email", { exact: true }).fill(`qa@${domain}`);
    await page.getByRole("button", { name: "Daftar akun", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("domain publik yang valid");
    await expect(page.getByRole("heading", { name: "Buat akun SAP" })).toBeVisible();
  }
  expect(requests.filter(request => request.path === "/auth/register")).toHaveLength(0);
  await page.getByLabel("Email", { exact: true }).fill("qa@gmail.com");
  await page.getByRole("button", { name: "Daftar akun", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verifikasi email" })).toBeVisible();
  expect(requests.filter(request => request.path === "/auth/register")).toHaveLength(1);
});

test("server email validation produces a specific signup error instead of a generic failure", async ({ page }) => {
  await fixtureApi(page, { handler: async (route, path) => {
    if (path !== "/auth/register") return false;
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "An unexpected error occurred.", fields: { email: ["Invalid domain"] } } }) });
    return true;
  } });
  await page.goto("/signup");
  await page.getByLabel("Nama lengkap", { exact: true }).fill("Synthetic User");
  await page.getByLabel("Email", { exact: true }).fill("qa@gmail.com");
  await page.getByLabel("Kata sandi", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Daftar akun", exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText("Alamat email tidak valid atau tidak dapat menerima pesan. Periksa alamat dan domain email Anda.");
  await expect(page.locator('p[role="alert"]')).toHaveCount(1);
});

test("SAPA sends and renders one reply for simultaneous submissions, then accepts another turn", async ({ page }, testInfo) => {
  let replies = 0;
  let release!: () => void;
  const firstReply = new Promise<void>(resolve => { release = resolve; });
  const requests = await fixtureApi(page, { handler: async (route, path) => {
    if (path === "/auth/me") { await json(route, { ...user, sapaEnabled: true }); return true; }
    if (path === "/assistant/chat") {
      const replyNumber = ++replies;
      if (replyNumber === 1) await firstReply;
      await json(route, { conversationId: ids.operation, reply: `Synthetic reply ${replyNumber}`, suggestedActions: [], citations: [] }); return true;
    }
    return false;
  } });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: testInfo.project.name === "mobile" ? "Buka chat SAPA dari navbar" : "Buka chat SAPA", exact: true }).click();
  await page.getByLabel("Pesan untuk SAPA").fill("How do I sort plastic?");
  await page.getByLabel("Pesan untuk SAPA").evaluate(input => {
    const form = input.closest("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect.poll(() => replies).toBe(1);
  expect(requests.filter(request => request.path === "/assistant/chat")).toHaveLength(1);
  release();
  const log = page.getByRole("log", { name: "Percakapan SAPA" });
  await expect(log.getByText("Synthetic reply 1", { exact: true })).toHaveCount(1);
  await page.getByLabel("Pesan untuk SAPA").fill("And glass?");
  await page.getByRole("button", { name: "Kirim pesan ke SAPA" }).click();
  await expect(log.getByText("Synthetic reply 2", { exact: true })).toHaveCount(1);
  expect(requests.filter(request => request.path === "/assistant/chat")).toHaveLength(2);
  expect(requests.filter(request => request.path === "/assistant/chat")[1].body).toMatchObject({ conversationId: ids.operation });
});

const manualSecret = "JBSWY3DPEHPK3PXP";
async function settingsFixture(page: Page) {
  await page.route("**/api/settings-capabilities", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ mfaAvailable: true }) }));
  return fixtureApi(page, { handler: async (route, path) => {
    if (path === "/auth/mfa") { await json(route, { status: "disabled" }); return true; }
    if (path === "/auth/reauthenticate") { await json(route, { ok: true }); return true; }
    if (path === "/auth/mfa/enroll") { await json(route, { provisioningUri: `otpauth://totp/SAP:synthetic?secret=${manualSecret}&issuer=SAP`, expiresAt: future }); return true; }
    if (path === "/auth/mfa/enroll/confirm") { await json(route, { recoveryCodes: ["ABCDE-FG234", "HIJKL-MN567"] }); return true; }
    if (path === "/users/me" && route.request().method() === "PATCH") { await json(route, user); return true; }
    if (path === "/users/me/report-notification-preferences") { await json(route, { emailEnabled: false }); return true; }
    return false;
  } });
}

async function enroll(page: Page) {
  await page.goto("/dashboard?view=settings");
  await page.getByRole("button", { name: "Aktifkan verifikasi dua langkah", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Kata sandi saat ini", { exact: true }).fill("synthetic-password");
  await dialog.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await dialog.getByText("Masukkan kode secara manual", { exact: true }).click();
  return dialog;
}

test("MFA copies only the manual secret and protects one-time recovery codes", async ({ page }, testInfo) => {
  await settingsFixture(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const dialog = await enroll(page);
  await dialog.getByRole("button", { name: "Salin kode manual" }).click();
  await expect(dialog.getByRole("status")).toContainText("Kode manual disalin.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(manualSecret);
  await dialog.getByLabel("Kode autentikator", { exact: true }).fill("123456");
  await dialog.getByRole("button", { name: "Konfirmasi & aktifkan" }).click();
  const recovery = page.getByRole("dialog", { name: "Simpan kode pemulihan" });
  await expect(recovery.getByText("Tanpa aplikasi autentikator atau kode pemulihan, Anda tidak dapat masuk ke akun.")).toBeVisible();
  await expect(recovery.getByRole("button", { name: "Sudah disimpan, masuk kembali" })).toBeDisabled();
  await expect(recovery.getByRole("button", { name: "Tutup dialog" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(recovery).toBeVisible();
  await recovery.getByLabel("Saya sudah menyimpan kode di tempat aman.").check();
  await expect(recovery.getByRole("button", { name: "Sudah disimpan, masuk kembali" })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("mfa-recovery.png"), fullPage: true });
});

test("clipboard denial leaves the manual MFA key available and explains how to copy it", async ({ page }) => {
  await settingsFixture(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new DOMException("Denied", "NotAllowedError"); } } });
  });
  const dialog = await enroll(page);
  await dialog.getByRole("button", { name: "Salin kode manual" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Kode belum dapat disalin. Pilih dan salin kode manual yang ditampilkan.");
  await expect(dialog.locator("code")).toHaveText(manualSecret);
  await expect(dialog.getByRole("button", { name: "Salin kode manual" })).toBeEnabled();
});

test("settings has one profile-photo heading and routes evidence notices to notifications", async ({ page }) => {
  const requests = await settingsFixture(page);
  await page.goto("/dashboard?view=settings");
  await expect(page.getByRole("heading", { name: "Foto profil", exact: true })).toHaveCount(1);
  const link = page.getByRole("link", { name: "Kelola notifikasi" });
  await expect(link).toHaveAttribute("href", "/dashboard?view=notifications");
  await expect(page.getByText("Permintaan bukti tambahan dari admin tersedia di Notifikasi. Buka laporan dari notifikasi untuk menambahkan bukti.")).toBeVisible();
  expect(requests.filter(request => request.path === "/users/me/report-notification-preferences")).toHaveLength(0);
  await link.click();
  await expect(page).toHaveURL(/view=notifications/);
  await expect(page.getByRole("heading", { name: "Notifikasi", exact: true })).toBeVisible();
});

test("a dashboard toast does not overlap the report wizard continue action", async ({ page }, testInfo) => {
  await settingsFixture(page);
  await page.goto("/dashboard?view=settings");
  await page.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
  const toast = page.getByRole("status").filter({ hasText: "Profil tersimpan di akun SAP Anda." });
  await expect(toast).toBeVisible();
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Beranda", exact: true }).click();
  else await page.getByRole("navigation", { name: "Navigasi dashboard", exact: true }).getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Buat laporan", exact: true }).click();
  const next = page.getByRole("button", { name: "Lanjut ke lokasi", exact: true });
  await next.scrollIntoViewIfNeeded();
  const action = (await next.boundingBox())!, notice = (await toast.boundingBox())!;
  expect(action.x + action.width <= notice.x || notice.x + notice.width <= action.x || action.y + action.height <= notice.y || notice.y + notice.height <= action.y).toBe(true);
  await next.click();
  await expect(page.getByRole("alert").filter({ hasText: "Tambahkan setidaknya satu foto bukti" })).toBeVisible();
  await expect(toast).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("wizard-toast.png"), fullPage: true });
});
