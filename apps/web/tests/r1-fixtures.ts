import type { Page, Route } from "@playwright/test";
import type { R1 } from "../lib/api/r1";
import type { SapUser } from "../lib/api/client";
/** Synthetic contract fixtures, never imported by production components/adapters. */
export const ids = {
  incident: "00000001-1000-4000-8000-000000000001",
  canonical: "00000002-1000-4000-8000-000000000002",
  activity: "00000003-1000-4000-8000-000000000003",
  update: "00000004-1000-4000-8000-000000000004",
  post: "00000005-1000-4000-8000-000000000005",
  operation: "00000006-1000-4000-8000-000000000006",
  media: "00000007-1000-4000-8000-000000000007",
  rendition: "00000008-1000-4000-8000-000000000008",
};
export const time = "2026-10-04T01:00:00.000Z",
  future = "2099-10-05T01:00:00.000Z";
export const permission = { allowed: true, reasonCode: null };
export const user: SapUser = {
  id: ids.canonical,
  email: "warga@example.invalid",
  displayName: "Warga contoh · TEST",
  role: "user",
  emailVerified: true,
  sapaEnabled: false,
  avatarMediaId: null,
};
export const incident: R1["PublicIncident"] = {
  kind: "incident",
  id: ids.incident,
  sourceRevision: 1,
  title: "Kejadian sintetis untuk pengujian",
  summary: "Sampah plastik terlihat di area taman. Data ini hanya fixture tes.",
  status: "verified",
  categoryId: "plastic",
  area: { cellId: "test-area", label: "Area pengujian" },
  occurredAt: time,
  lastObservedAt: time,
  updatedAt: time,
  evidence: [],
  supportCount: 3,
  supportClosed: false,
  relatedActivityIds: [ids.activity],
  canonicalPath: `/incidents/${ids.incident}`,
};
export const viewer: R1["IncidentViewer"] = {
  incidentId: ids.incident,
  supported: false,
  following: false,
  actions: { support: permission, follow: permission, update: permission },
};
export const activity: R1["PublicActivity"] = {
  kind: "activity",
  id: ids.activity,
  reportId: ids.incident,
  revision: 1,
  title: "Bersih taman · TEST",
  description: "Kegiatan sintetis untuk memeriksa alur relawan frontend SAP.",
  status: "registration_open",
  cancellationReason: null,
  area: incident.area,
  coordinatorDisplayName: "Koordinator SAP",
  startsAt: "2026-10-11T01:00:00Z",
  endsAt: "2026-10-11T04:00:00Z",
  registrationClosesAt: "2026-10-10T01:00:00Z",
  timezone: "Asia/Jakarta",
  capacity: 30,
  acceptedCount: 18,
  availableSeats: 12,
  registrationOpen: true,
  registrationClosedReason: null,
  equipment: ["Sarung tangan", "Botol minum"],
  accessibilityNotes: "Jalur utama dapat dilalui dengan pendamping.",
  wasteHandoverPlan: "Sampah dipilah dan diserahkan ke bank sampah.",
  resultOutcome: null,
  canonicalPath: `/activities/${ids.activity}`,
};
export const membership: R1["Membership"] = {
  id: ids.update,
  activityId: ids.activity,
  revision: 1,
  status: "requested",
  attendance: "unknown",
  reason: null,
  createdAt: time,
  updatedAt: time,
};
export const activityView: R1["ActivityViewer"] = {
  activityId: ids.activity,
  membership: null,
  meetingPoint: null,
  scheduleRevision: 1,
  scheduleAcknowledgementRequired: false,
  actions: {
    join: permission,
    cancelMembership: { allowed: false, reasonCode: "NOT_PARTICIPATING" },
    manage: { allowed: false, reasonCode: "NOT_COORDINATOR" },
  },
};
export const update: R1["AdminCommunityUpdate"] = {
  id: ids.update,
  reportId: ids.incident,
  revision: 1,
  kind: "still_present",
  observedAt: time,
  description: "Kondisi sintetis masih perlu ditangani di area ini.",
  mediaIds: [],
  correctionField: null,
  status: "needs_evidence",
  publicSummary: null,
  requestedEvidence: ["Tambahkan foto kondisi terbaru."],
  decisionReason: "Perlu melengkapi bukti terkini.",
  approvedResolutionEvidence: [],
  createdAt: time,
  updatedAt: time,
  latestReview: null,
};
export const managed: R1["ManagedActivity"] = {
  id: activity.id,
  revision: 1,
  reportId: activity.reportId,
  title: activity.title,
  description: activity.description,
  coordinatorId: user.id,
  startsAt: activity.startsAt,
  endsAt: activity.endsAt,
  registrationClosesAt: activity.registrationClosesAt,
  timezone: activity.timezone,
  capacity: activity.capacity,
  meetingPoint: {
    instructions: "Pintu masuk taman · TEST",
    latitude: null,
    longitude: null,
  },
  equipment: activity.equipment,
  accessibilityNotes: activity.accessibilityNotes,
  wasteHandoverPlan: activity.wasteHandoverPlan,
  status: activity.status,
  coordinatorAcceptedAt: null,
  acceptedCount: 18,
  availableSeats: 12,
  registrationOpen: true,
  registrationClosedReason: null,
  holdReason: null,
  priorState: null,
  createdAt: time,
  updatedAt: time,
  actions: {
    publish: { allowed: false, reasonCode: "ADMIN_ONLY" },
    edit: permission,
    cancel: permission,
    start: permission,
    closeRegistration: permission,
    hold: permission,
    resume: permission,
    requestResult: permission,
  },
};
export const settings: R1["PublicationSettings"] = {
  revision: 1,
  source: "reports",
  onlyVerified: true,
  format: "feed",
  timezone: "Asia/Jakarta",
  draftGeneration: "manual",
  publishMode: "approval_required",
  captionTemplate: "{ringkasan_laporan}",
  hashtags: "#SAP",
};
export const overview: R1["InstagramOverview"] = {
  account: { username: "sap.test", status: "connected" },
  capabilities: {
    canCreateDraft: true,
    canPublish: true,
    canRetract: true,
    canConnect: true,
    canAutomate: true,
  },
  capabilityReasons: {
    canCreateDraft: null,
    canPublish: null,
    canRetract: null,
    canConnect: null,
    canAutomate: null,
  },
  settings,
  stats: {
    total: 1,
    byStatus: {
      draft: 1,
      publishing: 0,
      published: 0,
      failed: 0,
      cancelled: 0,
      retracting: 0,
      retracted: 0,
      needs_action: 0,
    },
  },
};
export const rendition: R1["PublicationRendition"] = {
  id: ids.rendition,
  revision: 1,
  templateVersion: "test",
  status: "ready",
  url: "/images/instagram/publication-empty.svg",
  expiresAt: future,
};
export const post: R1["InstagramPost"] = {
  id: ids.post,
  revision: 1,
  contentRevision: 1,
  publicationSeriesId: ids.incident,
  generation: 1,
  replacesPostId: null,
  kind: "initial",
  milestoneId: null,
  source: {
    reportId: ids.incident,
    sourceRevision: 1,
    scanId: null,
    status: "verified",
    occurredAt: time,
    area: incident.area,
    title: "Publikasi sintetis · TEST",
    categoryName: "Plastik",
    mediaId: ids.media,
    publicSummary: incident.summary,
  },
  status: "draft",
  caption: "Caption sintetis untuk tes. Bukan postingan nyata.",
  altText: "Ilustrasi tes, bukan bukti kejadian.",
  rendition,
  approval: {
    status: "unapproved",
    contentRevision: null,
    sourceRevision: null,
    renditionId: null,
    approvedAt: null,
  },
  createdAt: time,
  updatedAt: time,
  publishedAt: null,
  retractedAt: null,
  permalink: null,
  publishError: null,
  lastOperationId: null,
  actions: {
    edit: permission,
    approve: permission,
    publish: { allowed: false, reasonCode: "APPROVAL_REQUIRED" },
    cancel: permission,
    retract: { allowed: false, reasonCode: "NOT_PUBLISHED" },
  },
};
export const preview = (p: R1["InstagramPost"]): R1["PublicationPreview"] => ({
  postId: p.id,
  revision: p.revision,
  contentRevision: p.contentRevision,
  sourceRevision: p.source.sourceRevision,
  caption: p.caption,
  altText: p.altText,
  rendition: p.rendition,
  approval: p.approval,
});
export const operation: R1["PublicationOperation"] = {
  id: ids.operation,
  postId: ids.post,
  kind: "publish",
  status: "queued",
  channels: { sap: "unaffected", instagram: "pending" },
  errorCode: null,
  message: "Permintaan sintetis masuk antrean.",
  attemptCount: 0,
  nextRetryAt: null,
  createdAt: time,
  updatedAt: time,
};
export type ApiHandler = (route: Route, path: string) => Promise<boolean>;
export async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ data, meta: { requestId: "synthetic-test" } }),
  });
}
export async function failure(route: Route, status: number, code: string) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({
      error: { code, message: `Synthetic error: ${code}` },
      meta: { requestId: "synthetic-test" },
    }),
  });
}
export async function fixtureApi(
  page: Page,
  options: {
    guest?: boolean;
    role?: "admin" | "user";
    handler?: ApiHandler;
  } = {},
) {
  const requests: {
    path: string;
    method: string;
    body: unknown;
    key: string | undefined;
    revision: string | undefined;
  }[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace("/api/v1", "");
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {}
    requests.push({
      path,
      method: request.method(),
      body,
      key: request.headers()["idempotency-key"],
      revision: request.headers()["if-match"],
    });
    if (await options.handler?.(route, path)) return;
    if (path === "/auth/csrf")
      return json(route, {
        csrfToken: "SYNTHETIC_TEST_CSRF_NOT_A_REAL_SECRET",
        expiresAt: future,
      });
    if (path === "/auth/me")
      return options.guest
        ? failure(route, 401, "UNAUTHORIZED")
        : json(route, { ...user, role: options.role ?? "user" });
    if (path === "/users/me/stats")
      return json(route, {
        totalScans: 0,
        classifiedScans: 0,
        ecoPoints: 0,
        streakDays: 0,
        verifiedReports: 0,
        resolvedReports: 0,
        categoryCounts: [],
      });
    if (
      [
        "/scans",
        "/reports/mine",
        "/users/me/achievements",
        "/categories",
      ].includes(path)
    )
      return json(route, { items: [], nextCursor: null });
    if (path === `/public/incidents/${ids.incident}`)
      return json(route, incident);
    if (path === `/public/incidents/${ids.incident}/timeline`)
      return json(route, { items: [], nextCursor: null });
    if (path === `/public/incidents/${ids.incident}/viewer`)
      return options.guest
        ? failure(route, 401, "UNAUTHORIZED")
        : json(route, viewer);
    if (path === `/public/incidents/${ids.incident}/support`)
      return json(route, {
        incidentId: ids.incident,
        supported: true,
        supportCount: 4,
        supportClosed: false,
      });
    if (path === `/public/incidents/${ids.incident}/follow`)
      return json(route, { incidentId: ids.incident, following: true });
    if (path === "/activities")
      return json(route, { items: [activity], nextCursor: null });
    if (path === `/activities/${ids.activity}`) return json(route, activity);
    if (path === `/activities/${ids.activity}/public-results`)
      return json(route, { items: [], nextCursor: null });
    if (path === `/activities/${ids.activity}/viewer`)
      return options.guest
        ? failure(route, 401, "UNAUTHORIZED")
        : json(route, activityView);
    if (path === `/activities/${ids.activity}/manage`)
      return json(route, managed);
    if (path === "/users/me/community-updates")
      return json(route, { items: [update], nextCursor: null });
    if (path === `/community-updates/${ids.update}`) return json(route, update);
    if (
      path === "/users/me/notifications" ||
      path === "/users/me/followed-incidents" ||
      path === "/users/me/activities" ||
      path === "/users/me/coordinator-assignments"
    )
      return json(route, { items: [], nextCursor: null });
    if (path === "/admin/instagram") return json(route, overview);
    if (path === "/admin/instagram/posts")
      return json(route, { items: [post], nextCursor: null, total: 1 });
    if (path === `/admin/instagram/posts/${ids.post}`) return json(route, post);
    if (path === `/admin/instagram/posts/${ids.post}/preview`)
      return json(route, preview(post));
    if (
      path === `/admin/instagram/reports/${ids.incident}/media/${ids.media}/url`
    )
      return json(route, {
        url: "/images/instagram/publication-empty.svg",
        expiresAt: future,
      });
    if (path === `/admin/instagram/operations/${ids.operation}`)
      return json(route, operation);
    // Fail closed: test fixtures never forward an unhandled API call to the real backend.
    return failure(route, 404, "TEST_FIXTURE_UNHANDLED");
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const tag = document.createElement("div");
      tag.textContent = "DATA SINTETIS · KHUSUS TES";
      tag.style.cssText =
        "position:fixed;bottom:2px;left:2px;z-index:99999;font:10px sans-serif;color:#365348;background:#e7f6ed;padding:2px 6px;pointer-events:none";
      document.body.append(tag);
    });
  });
  return requests;
}
