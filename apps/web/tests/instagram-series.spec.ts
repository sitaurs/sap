import { test, expect } from "@playwright/test";
import { fixtureApi, ids, incident, json, post, permission } from "./r1-fixtures";

test("an active Instagram generation is blocked in the source picker before editor", async ({ page }) => {
  const requests = await fixtureApi(page, {
    role: "admin",
    handler: async (route, path) => {
      if (path === "/admin/instagram/reports") {
        await json(route, {
          items: [{ reportId: ids.incident, scanId: null, status: "verified",
            publicSummary: incident.summary, categoryName: "Plastik", occurredAt: incident.occurredAt,
            createdAt: incident.updatedAt, mediaIds: [ids.media] }],
          nextCursor: null,
        });
        return true;
      }
      if (path === `/admin/reports/${ids.incident}/lifecycle`) {
        await json(route, {
          reportId: ids.incident, sourceRevision: 1, publicVisibility: "public", instagramAllowed: true,
          latestReview: null, approvedResolutionEvidence: [], resolutionReviewRequired: false,
          publicationAssets: [{ mediaId: ids.media, renditionId: ids.rendition, channels: ["instagram"],
            sourceType: "report", sourceId: ids.incident }],
          publicationMilestones: [],
          instagramPublicationSeries: [{ kind: "initial", milestoneId: null, latestPostId: ids.post,
            generation: 1, status: "draft", canCreate: false, reasonCode: "INVALID_TRANSITION" }],
          actions: { moderate: permission, withdraw: permission, restore: permission,
            createInstagramDraft: permission },
        });
        return true;
      }
      if (path === `/admin/reports/${ids.incident}/publications`) {
        await json(route, { items: [post], nextCursor: null, total: 1 });
        return true;
      }
      return false;
    },
  });

  await page.goto("/dashboard?view=admin-instagram");
  await page.locator("header").getByRole("button", { name: "Pilih laporan", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Pilih sumber publikasi" });
  await picker.getByRole("button", { name: "Periksa kelayakan publikasi" }).click();
  await expect(picker.getByRole("alert")).toContainText("Generation 1 seri ini masih berstatus Draf");
  await expect(picker.locator('option[value="initial"]')).toHaveAttribute("disabled", "");
  await expect(picker.getByRole("button", { name: "Pilih foto berizin 1" })).toBeDisabled();
  expect(requests.some((request) => request.path === "/admin/instagram/posts" && request.method === "POST")).toBe(false);
});
