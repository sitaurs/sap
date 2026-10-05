import { test, expect } from "@playwright/test";
import {
  fixtureApi,
  failure,
  ids,
  json,
  operation,
  post,
  preview,
  future,
  managed,
  membership,
  time,
} from "./r1-fixtures";
import type { R1 } from "../lib/api/r1";
const photo = {
  name: "bukti-sintetis.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1kAAAAASUVORK5CYII=",
    "base64",
  ),
};

test("uncertain membership change requires a fresh viewer read before another action", async ({
  page,
}) => {
  const requests = await fixtureApi(page, {
    handler: async (route, path) => {
      if (path.endsWith("/membership")) {
        await route.abort("connectionreset");
        return true;
      }
      return false;
    },
  });
  await page.goto(`/activities/${ids.activity}`);
  const join = page.getByRole("button", { name: "Ajukan ikut kegiatan" });
  await join.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "belum diketahui" }),
  ).toBeVisible();
  await expect(join).toBeDisabled();
  expect(requests.filter((r) => r.path.endsWith("/membership"))).toHaveLength(
    1,
  );
  await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
  await expect(join).toBeEnabled();
  expect(
    requests.filter((r) => r.path.endsWith("/viewer")).length,
  ).toBeGreaterThan(1);
});

test("Instagram conflict preserves caption until latest version is explicitly reviewed", async ({
  page,
}) => {
  let conflict = true,
    current = { ...post };
  const requests = await fixtureApi(page, {
    role: "admin",
    handler: async (route, path) => {
      if (path === `/admin/instagram/posts/${ids.post}`) {
        if (route.request().method() === "PATCH") {
          if (conflict) {
            conflict = false;
            current = {
              ...post,
              revision: 2,
              caption: "Versi moderator · TEST",
            };
            await failure(route, 409, "REVISION_CONFLICT");
          } else {
            current = {
              ...current,
              revision: 3,
              contentRevision: 2,
              ...route.request().postDataJSON(),
            };
            await json(route, current);
          }
        } else await json(route, current);
        return true;
      }
      if (path.endsWith("/preview")) {
        await json(route, preview(current));
        return true;
      }
      return false;
    },
  });
  await page.goto("/dashboard?view=admin-instagram");
  await page.getByRole("button", { name: /Detail Publikasi sintetis/ }).click();
  const dialog = page.getByRole("dialog"),
    input = dialog.getByLabel("Caption Instagram");
  await input.fill(
    "Caption saya dipertahankan ketika moderator menyimpan revisi baru.",
  );
  await dialog
    .getByRole("button", { name: "Simpan draf", exact: true })
    .click();
  await expect(dialog.getByText("Versi terbaru · revisi 2")).toBeVisible();
  await expect(input).toHaveValue(
    "Caption saya dipertahankan ketika moderator menyimpan revisi baru.",
  );
  await expect(
    dialog.getByRole("button", { name: "Simpan draf", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", {
      name: "Saya sudah meninjau, pertahankan input saya",
    })
    .click();
  await dialog
    .getByRole("button", { name: "Simpan draf", exact: true })
    .click();
  await expect
    .poll(() => requests.filter((r) => r.method === "PATCH").length)
    .toBe(2);
  expect(
    requests.filter((r) => r.method === "PATCH").map((r) => r.revision),
  ).toEqual(["1", "2"]);
});

test("manual retraction uploads proof and does not treat needs_action as success", async ({
  page,
}) => {
  let op: R1["PublicationOperation"] = {
    ...operation,
    kind: "retract",
    status: "needs_action",
    channels: { sap: "hidden", instagram: "needs_action" },
  };
  const current: R1["InstagramPost"] = {
    ...post,
    status: "needs_action",
    lastOperationId: ids.operation,
    publishedAt: time,
  };
  const requests = await fixtureApi(page, {
    role: "admin",
    handler: async (route, path) => {
      if (path === `/admin/instagram/posts/${ids.post}`) {
        await json(route, current);
        return true;
      }
      if (path.endsWith("/preview")) {
        await json(route, preview(current));
        return true;
      }
      if (path === `/admin/instagram/operations/${ids.operation}`) {
        await json(route, op);
        return true;
      }
      if (path.endsWith("/manual-confirmation")) {
        op = { ...op, status: "queued" };
        await json(route, op, 202);
        return true;
      }
      if (path === "/media") {
        await json(route, { id: ids.media });
        return true;
      }
      return false;
    },
  });
  await page.goto("/dashboard?view=admin-instagram");
  await page.getByRole("button", { name: /Detail Publikasi sintetis/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Perlu tindakan manual" }),
  ).toBeVisible();
  await dialog.getByLabel("Bukti penghapusan").setInputFiles(photo);
  await dialog
    .getByLabel("Penjelasan penghapusan")
    .fill("Postingan telah dihapus manual dan bukti sintetis dilampirkan.");
  await dialog.getByRole("button", { name: /Konfirmasi penghapusan/ }).click();
  await expect
    .poll(
      () =>
        requests.filter((r) => r.path.endsWith("/manual-confirmation")).length,
    )
    .toBe(1);
  expect(
    requests.find((r) => r.path.endsWith("/manual-confirmation"))?.body,
  ).toEqual({
    evidenceMediaIds: [ids.media],
    explanation:
      "Postingan telah dihapus manual dan bukti sintetis dilampirkan.",
  });
  await expect(
    dialog.getByRole("heading", { name: "Dalam antrean" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Operasi selesai" }),
  ).toHaveCount(0);
});

test("coordinator member decisions use the coordinator endpoint and revision", async ({
  page,
}) => {
  const member = { ...membership, displayName: "Relawan sintetis · TEST" };
  const requests = await fixtureApi(page, {
    handler: async (route, path) => {
      if (path.endsWith("/manage")) {
        await json(route, { ...managed, coordinatorAcceptedAt: time });
        return true;
      }
      if (path === `/activities/${ids.activity}/memberships`) {
        await json(route, { items: [member], nextCursor: null });
        return true;
      }
      if (path === `/activities/${ids.activity}/memberships/${ids.update}`) {
        await json(route, { ...member, revision: 2, status: "accepted" });
        return true;
      }
      return false;
    },
  });
  await page.goto(`/activities/${ids.activity}/manage`);
  await page.getByRole("button", { name: "Kelola peserta" }).click();
  await page.getByRole("button", { name: /Relawan sintetis/ }).click();
  await page
    .getByLabel("Alasan keputusan")
    .fill("Peserta sesuai kebutuhan kegiatan sintetis.");
  await page
    .getByRole("button", { name: "Simpan keputusan", exact: true })
    .click();
  await expect
    .poll(() => requests.filter((r) => r.method === "PATCH").length)
    .toBe(1);
  expect(requests.find((r) => r.method === "PATCH")?.revision).toBe("1");
  expect(
    requests.filter((r) => r.path.startsWith("/admin/activities")),
  ).toHaveLength(0);
});

test("expired final preview never enables approval or publishes privately", async ({
  page,
}) => {
  const current = {
    ...post,
    rendition: { ...post.rendition, expiresAt: "2020-01-01T00:00:00Z" },
  };
  const requests = await fixtureApi(page, {
    role: "admin",
    handler: async (route, path) => {
      if (path === `/admin/instagram/posts/${ids.post}`) {
        await json(route, current);
        return true;
      }
      if (path.endsWith("/preview")) {
        await json(route, preview(current));
        return true;
      }
      return false;
    },
  });
  await page.goto("/dashboard?view=admin-instagram");
  await page.getByRole("button", { name: /Detail Publikasi sintetis/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Preview kedaluwarsa/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Setujui konten" }),
  ).toBeDisabled();
  expect(
    requests.filter((r) => r.path === `/media/${ids.media}/url`),
  ).toHaveLength(0);
});

test("disconnect with pending retractions asks for explicit acknowledgement", async ({
  page,
}) => {
  const requests = await fixtureApi(page, {
    role: "admin",
    handler: async (route, path) => {
      if (path === "/admin/instagram/account/disconnect") {
        if (!route.request().postDataJSON().acknowledgePendingRetractions)
          await failure(route, 409, "PENDING_RETRACTIONS");
        else
          await json(
            route,
            { ...operation, kind: "disconnect", postId: null },
            202,
          );
        return true;
      }
      return false;
    },
  });
  await page.goto("/dashboard?view=admin-instagram");
  await page.getByRole("button", { name: /sap.test/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Putuskan koneksi akun" }).click();
  await dialog
    .getByRole("button", { name: "Konfirmasi putus koneksi" })
    .click();
  await expect(
    dialog.getByRole("alert").filter({ hasText: "Masih ada penarikan" }),
  ).toBeVisible();
  await dialog
    .getByRole("checkbox", { name: /Saya memahami penarikan/ })
    .check();
  await dialog
    .getByRole("button", { name: "Konfirmasi putus koneksi" })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Dalam antrean" }),
  ).toBeVisible();
  expect(
    requests
      .filter((r) => r.path.endsWith("/account/disconnect"))
      .map((r) => r.body),
  ).toEqual([
    { acknowledgePendingRetractions: false },
    { acknowledgePendingRetractions: true },
  ]);
});
