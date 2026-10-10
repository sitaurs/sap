import { test, expect } from "@playwright/test";
import { safeReturnTo } from "../lib/auth-return";
import {
  activityView,
  activity,
  fixtureApi,
  failure,
  future,
  ids,
  incident,
  json,
  managed,
  operation,
  permission,
  post,
  preview,
  time,
  user,
} from "./r1-fixtures";
import type { R1 } from "../lib/api/r1";

test("returnTo rejects external redirects and auth loops", () => {
  for (const value of [
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "/login",
    "javascript:alert(1)",
    "/signup?returnTo=/dashboard",
  ])
    expect(safeReturnTo(value)).toBe("/dashboard");
  expect(safeReturnTo(`/incidents/${ids.incident}?focus=updates`)).toBe(
    `/incidents/${ids.incident}?focus=updates`,
  );
});
test("guest sees public detail and login returns to the incident", async ({
  page,
}) => {
  const requests = await fixtureApi(page, {
    guest: true,
    handler: async (route, path) => {
      if (path === "/auth/login") {
        await json(route, user);
        return true;
      }
      return false;
    },
  });
  await page.goto(`/incidents/${ids.incident}`);
  await expect(
    page.getByRole("heading", { name: incident.title }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Masuk untuk berkontribusi" }).click();
  await expect(page).toHaveURL(/login\?returnTo=/);
  await page.getByLabel("Email", { exact: true }).fill("warga@example.invalid");
  await page
    .getByLabel("Kata sandi", { exact: true })
    .fill("synthetic-password-for-test");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/incidents/${ids.incident}(?:#kontribusi-warga)?$`));
  expect(
    requests.filter(
      (r) =>
        r.path.startsWith("/media/") || r.path === `/reports/${ids.incident}`,
    ),
  ).toHaveLength(0);
});
test("timeline entries without evidence do not show a false empty state when the report has a photo", async ({ page }) => {
  const reportEvidence: R1["PublicEvidence"] = {
    id: ids.media,
    url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    expiresAt: future,
    observedAt: null,
    caption: "Foto utama laporan · TEST",
  };
  await fixtureApi(page, {
    handler: async (route, path) => {
      if (path === `/public/incidents/${ids.incident}`) {
        await json(route, { ...incident, evidence: [reportEvidence] });
        return true;
      }
      if (path === `/public/incidents/${ids.incident}/timeline`) {
        await json(route, {
          items: [{
            id: ids.update,
            kind: "condition_updated",
            occurredAt: time,
            observedAt: time,
            summary: "Pembaruan tanpa lampiran · TEST",
            evidence: [],
          }],
          nextCursor: null,
        });
        return true;
      }
      return false;
    },
  });

  await page.goto(`/incidents/${ids.incident}`);
  await expect(page.getByRole("img", { name: "Foto utama laporan · TEST" })).toBeVisible();
  const timeline = page.getByRole("heading", { name: "Perjalanan kejadian" }).locator("..");
  await expect(timeline.getByText("Pembaruan tanpa lampiran · TEST", { exact: true })).toBeVisible();
  await expect(timeline.getByText("Belum ada bukti yang disetujui untuk publik.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Belum ada bukti yang disetujui untuk publik.", { exact: true })).toHaveCount(0);
});
test("email verification keeps the original activity destination", async ({
  page,
}) => {
  await fixtureApi(page, {
    handler: async (route, path) => {
      if (path === "/auth/login") {
        await failure(route, 403, "EMAIL_UNVERIFIED");
        return true;
      }
      if (path === "/auth/resend-verification") {
        await json(route, {
          challengeId: ids.update,
          expiresAt: "2099-01-01T00:00:00Z",
          retryAfterSeconds: 60,
          message: "Synthetic challenge",
        });
        return true;
      }
      if (path === "/auth/verify-email") {
        await json(route, user);
        return true;
      }
      return false;
    },
  });
  await page.goto(
    `/login?returnTo=${encodeURIComponent(`/activities/${ids.activity}`)}`,
  );
  await page.getByLabel("Email", { exact: true }).fill("warga@example.invalid");
  await page
    .getByLabel("Kata sandi", { exact: true })
    .fill("synthetic-password-for-test");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.getByLabel("Kode 6 digit").fill("123456");
  await page.getByRole("button", { name: "Verifikasi & masuk" }).click();
  await expect(page).toHaveURL(new RegExp(`/activities/${ids.activity}$`));
});
test("support and follow are separate operations", async ({ page }) => {
  const requests = await fixtureApi(page);
  await page.goto(`/incidents/${ids.incident}`);
  await page
    .getByRole("button", { name: "Dukung kejadian", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Batalkan dukungan" }),
  ).toBeVisible();
  expect(requests.filter((r) => r.path.endsWith("/follow"))).toHaveLength(0);
  await page.getByRole("button", { name: "Ikuti kabar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Berhenti mengikuti" }),
  ).toBeVisible();
  expect(
    requests.filter((r) => r.method === "PUT" && r.path.endsWith("/support")),
  ).toHaveLength(1);
  expect(
    requests.filter((r) => r.method === "PUT" && r.path.endsWith("/follow")),
  ).toHaveLength(1);
});
test("canonical redirect leads only to another public incident", async ({
  page,
}) => {
  await fixtureApi(page, {
    handler: async (route, path) => {
      if (path === `/public/incidents/${ids.incident}`) {
        await json(route, {
          kind: "redirect",
          canonicalId: ids.canonical,
          canonicalPath: `/incidents/${ids.canonical}`,
        });
        return true;
      }
      if (path.startsWith(`/public/incidents/${ids.canonical}`)) {
        await json(
          route,
          path.endsWith("/timeline")
            ? { items: [], nextCursor: null }
            : path.endsWith("/viewer")
              ? {
                  incidentId: ids.canonical,
                  supported: false,
                  following: false,
                  actions: {
                    support: permission,
                    follow: permission,
                    update: permission,
                  },
                }
              : {
                  ...incident,
                  id: ids.canonical,
                  canonicalPath: `/incidents/${ids.canonical}`,
                },
        );
        return true;
      }
      return false;
    },
  });
  await page.goto(`/incidents/${ids.incident}`);
  await expect(page).toHaveURL(new RegExp(`/incidents/${ids.canonical}$`));
  await expect(
    page.getByRole("heading", { name: incident.title }),
  ).toBeVisible();
});
test("withdrawn during timeline load removes earlier public content", async ({
  page,
}) => {
  await fixtureApi(page, {
    handler: async (route, path) => {
      if (path.endsWith("/timeline")) {
        await failure(route, 410, "INCIDENT_WITHDRAWN");
        return true;
      }
      return false;
    },
  });
  await page.goto(`/incidents/${ids.incident}`);
  await expect(
    page.getByRole("alert").filter({ hasText: "dicabut" }),
  ).toBeVisible();
  await expect(page.getByText(incident.summary, { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("heading", { name: incident.title })).toHaveCount(
    0,
  );
});
test("disabled R1 uses unavailable state without sample fallback", async ({
  page,
}) => {
  await fixtureApi(page, {
    handler: async (route, path) => {
      if (path === "/activities") {
        await failure(route, 503, "FEATURE_UNAVAILABLE");
        return true;
      }
      return false;
    },
  });
  await page.goto("/activities");
  await expect(
    page.getByRole("alert").filter({ hasText: "Fitur belum tersedia" }),
  ).toBeVisible();
  await expect(page.getByText("Bersih taman · TEST")).toHaveCount(0);
});
test("join request remains requested, never accepted optimistically", async ({
  page,
}) => {
  const requests = await fixtureApi(page, {
    handler: async (route, path) => {
      if (path === `/activities/${ids.activity}/membership`) {
        await json(route, {
          id: ids.update,
          activityId: ids.activity,
          revision: 1,
          status: "requested",
          attendance: "unknown",
          reason: null,
          createdAt: time,
          updatedAt: time,
        });
        return true;
      }
      return false;
    },
  });
  await page.goto(`/activities/${ids.activity}`);
  await page.getByRole("button", { name: "Ajukan ikut kegiatan" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "belum dinyatakan diterima" }),
  ).toBeVisible();
  expect(
    requests.filter((r) => r.path.endsWith("/membership"))[0].body,
  ).toEqual({ participating: true });
});
test("expired activity deadline displays closed registration and its reason", async ({
  page,
}) => {
  await fixtureApi(page, {
    handler: async (route, path) => {
      if (path === `/activities/${ids.activity}`) {
        await json(route, {
          ...activity,
          registrationOpen: false,
          registrationClosedReason: "deadline_passed",
        });
        return true;
      }
      return false;
    },
  });
  await page.goto(`/activities/${ids.activity}`);
  await expect(page.getByText("Pendaftaran ditutup", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "karena batas waktu pendaftaran telah lewat",
  );
  await expect(page.getByRole("button", { name: "Ajukan ikut kegiatan" })).toBeDisabled();
});
test("coordinator assignment uses explicit name consent and revision", async ({
  page,
}) => {
  const requests = await fixtureApi(page, {
    handler: async (route, path) => {
      if (path.endsWith("/coordinator-acceptance")) {
        await json(route, {
          ...managed,
          revision: 2,
          coordinatorAcceptedAt: time,
        });
        return true;
      }
      return false;
    },
  });
  await page.goto(`/activities/${ids.activity}/manage`);
  await page.getByRole("button", { name: "Terima penugasan" }).click();
  await expect(
    page.getByRole("button", { name: "Kelola peserta" }),
  ).toBeVisible();
  const r = requests.find((r) => r.path.endsWith("/coordinator-acceptance"));
  expect(r?.body).toEqual({ accepted: true, publishDisplayName: false });
  expect(r?.revision).toBe("1");
  expect(
    requests.filter((r) => r.path.startsWith("/admin/activities")),
  ).toHaveLength(0);
});
test("coordinator status badge reflects an expired registration deadline", async ({
  page,
}) => {
  await fixtureApi(page, {
    handler: async (route, path) => {
      if (path === `/activities/${ids.activity}/manage`) {
        await json(route, {
          ...managed,
          status: "registration_open",
          registrationOpen: false,
          registrationClosedReason: "deadline_passed",
          registrationClosesAt: time,
          coordinatorAcceptedAt: time,
        });
        return true;
      }
      return false;
    },
  });
  await page.goto(`/activities/${ids.activity}/manage`);
  await expect(
    page.getByText("Koordinator · Pendaftaran ditutup", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "karena batas waktu pendaftaran telah lewat",
  );
});
test("forbidden coordinator has no private management controls", async ({
  page,
}) => {
  await fixtureApi(page, {
    handler: async (route, path) => {
      if (path.endsWith("/manage")) {
        await failure(route, 403, "FORBIDDEN");
        return true;
      }
      return false;
    },
  });
  await page.goto(`/activities/${ids.activity}/manage`);
  await expect(
    page.getByRole("alert").filter({ hasText: "tidak memiliki izin" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kelola peserta" }),
  ).toHaveCount(0);
});
test("rejecting changed schedule asks before cancelling participation", async ({
  page,
}) => {
  const requests = await fixtureApi(page, {
    handler: async (route, path) => {
      if (path === `/activities/${ids.activity}/viewer`) {
        await json(route, {
          ...activityView,
          scheduleRevision: 2,
          scheduleAcknowledgementRequired: true,
        });
        return true;
      }
      if (path.endsWith("/schedule-acknowledgement")) {
        await json(route, {
          id: ids.update,
          activityId: ids.activity,
          revision: 2,
          status: "cancelled",
          attendance: "unknown",
          reason: null,
          createdAt: time,
          updatedAt: time,
        });
        return true;
      }
      return false;
    },
  });
  await page.goto(`/activities/${ids.activity}`);
  await page.getByRole("button", { name: "Jadwal tidak sesuai" }).click();
  expect(
    requests.filter((r) => r.path.endsWith("/schedule-acknowledgement")),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Ya, batalkan" }).click();
  await expect
    .poll(
      () =>
        requests.filter((r) => r.path.endsWith("/schedule-acknowledgement"))
          .length,
    )
    .toBe(1);
  expect(
    requests.find((r) => r.path.endsWith("/schedule-acknowledgement"))?.body,
  ).toEqual({ scheduleRevision: 2, confirmed: false });
});
test("Instagram approval is separate and 202 queued is not published", async ({
  page,
}) => {
  let current = { ...post };
  const requests = await fixtureApi(page, {
    role: "admin",
    handler: async (route, path) => {
      if (path === `/admin/instagram/posts/${ids.post}/approve`) {
        current = {
          ...current,
          revision: 2,
          approval: {
            status: "approved",
            contentRevision: 1,
            sourceRevision: 1,
            renditionId: ids.rendition,
            approvedAt: time,
          },
          actions: { ...current.actions, publish: permission },
        };
        await json(route, current);
        return true;
      }
      if (path === `/admin/instagram/posts/${ids.post}/publish`) {
        current = {
          ...current,
          revision: 3,
          status: "publishing",
          lastOperationId: ids.operation,
          actions: {
            ...current.actions,
            publish: { allowed: false, reasonCode: "IN_PROGRESS" },
          },
        };
        await json(route, operation, 202);
        return true;
      }
      if (path === `/admin/instagram/posts/${ids.post}`) {
        await json(route, current);
        return true;
      }
      if (path === `/admin/instagram/posts/${ids.post}/preview`) {
        await json(route, preview(current));
        return true;
      }
      return false;
    },
  });
  await page.goto("/dashboard?view=admin-instagram");
  await page.getByRole("button", { name: /Detail Publikasi sintetis/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Posting sekarang", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Setujui konten" }).click();
  await dialog.getByRole("button", { name: "Konfirmasi tindakan" }).click();
  await expect(
    dialog.getByRole("button", { name: "Posting sekarang", exact: true }),
  ).toBeEnabled();
  expect(requests.filter((r) => r.path.endsWith("/publish"))).toHaveLength(0);
  await dialog
    .getByRole("button", { name: "Posting sekarang", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Konfirmasi tindakan" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Dalam antrean" }),
  ).toBeVisible();
  await expect(dialog.getByText("Postingan berhasil diterbitkan.")).toHaveCount(
    0,
  );
  expect(requests.find((r) => r.path.endsWith("/approve"))?.body).toEqual({
    contentRevision: 1,
    sourceRevision: 1,
    renditionId: ids.rendition,
  });
  expect(requests.find((r) => r.path.endsWith("/publish"))?.revision).toBe("2");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: test.info().outputPath("instagram-pending-synthetic.png"),
    fullPage: true,
  });
});
test("uncertain publish keeps the same intent and does not auto retry", async ({
  page,
}) => {
  const approved: R1["InstagramPost"] = {
    ...post,
    approval: {
      status: "approved",
      contentRevision: 1,
      sourceRevision: 1,
      renditionId: ids.rendition,
      approvedAt: time,
    },
    actions: { ...post.actions, publish: permission },
  };
  const requests = await fixtureApi(page, {
    role: "admin",
    handler: async (route, path) => {
      if (path === `/admin/instagram/posts/${ids.post}`) {
        await json(route, approved);
        return true;
      }
      if (path === `/admin/instagram/posts/${ids.post}/preview`) {
        await json(route, preview(approved));
        return true;
      }
      if (path.endsWith("/publish")) {
        await route.abort("connectionreset");
        return true;
      }
      return false;
    },
  });
  await page.goto("/dashboard?view=admin-instagram");
  await page.getByRole("button", { name: /Detail Publikasi sintetis/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Posting sekarang", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Konfirmasi tindakan" }).click();
  await expect(dialog.getByRole("alert")).toContainText("belum diketahui");
  expect(requests.filter((r) => r.path.endsWith("/publish"))).toHaveLength(1);
  await expect(
    dialog.getByRole("button", { name: "Posting sekarang", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Perbarui versi dan preview" })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Posting sekarang", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Posting sekarang", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Konfirmasi tindakan" }).click();
  await expect
    .poll(() => requests.filter((r) => r.path.endsWith("/publish")).length)
    .toBe(2);
  expect(
    new Set(
      requests.filter((r) => r.path.endsWith("/publish")).map((r) => r.key),
    ).size,
  ).toBe(1);
});
test("public activity fits mobile and keyboard focus remains visible", async ({
  page,
}) => {
  await fixtureApi(page, { guest: true });
  await page.goto(`/activities/${ids.activity}`);
  await expect(
    page.getByRole("heading", { name: "Bersih taman · TEST" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  const original = page.viewportSize()!;
  for (const width of [320, 360, 430, 760]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole("link", { name: "Masuk untuk ikut" }),
    ).toBeVisible();
  }
  await page.setViewportSize(original);
  await page.screenshot({
    path: test.info().outputPath("activity-public-synthetic.png"),
    fullPage: true,
  });
});
