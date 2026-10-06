import {
  ApiError,
  apiGet as realApiGet,
  apiMutate as realApiMutate,
  type SapMediaUrl,
  type SapReport,
  type SapAuditEvent,
  type SapReportStatus,
} from "./client";
import type { components } from "./r1-schema";
import { activitiesMockEnabled } from "./activities-mode";

// Scoped to this feature: login, moderation, scans, and account APIs remain real.
async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (activitiesMockEnabled)
    return (await import("./activities-mock")).mockActivityRequest<T>(
      "GET",
      path,
      { signal },
    );
  return realApiGet<T>(path, signal);
}
async function apiMutate<T>(
  ...args: Parameters<typeof realApiMutate>
): Promise<T> {
  if (activitiesMockEnabled)
    return (await import("./activities-mock")).mockActivityRequest<T>(
      args[0],
      args[1],
      args[2],
    );
  return realApiMutate<T>(...args);
}

// Isolated R1 draft types: the published 1.1 client and contract stay intact.
type R1 = components["schemas"];
export type Activity = R1["ManagedActivity"];
export type ActivityInput = R1["ActivityInput"];
export type ActivityStatus = R1["ActivityStatus"];
export type ActivityCommand = R1["ActivityCommandInput"]["action"];
export type ActivityMember = R1["ManagedMembership"];
export type MemberStatus = ActivityMember["status"];
export type Candidate = R1["CoordinatorCandidate"];
export type ActivityResult = R1["ActivityResult"];
export type AdminActivityResult = R1["AdminActivityResult"];
export type ResultInput = R1["ActivityResultInput"];
export type ResultDecision = R1["ActivityResultDecision"];
export type Measurement = R1["ImpactMeasurement"];
export type Rendition = R1["EvidenceRendition"];
export type PublicationApproval = R1["EvidencePublicationInput"];
export type ReviewItem = R1["ReviewQueueItem"];
export type Page<T> = { items: T[]; nextCursor: string | null };
export type PublicActivity = R1["PublicActivity"];
export type PublicActivityDetail = R1["PublicActivityDetail"];
export type ActivityViewer = R1["ActivityViewer"];
export type MyActivity = R1["MyActivity"];

export const getActivitySourceReport = (id: string, signal?: AbortSignal) =>
  apiGet<SapReport>(`/reports/${encodeURIComponent(id)}`, signal);
export const listActivitySourceReports = (
  status?: SapReportStatus,
  cursor?: string,
  signal?: AbortSignal,
) =>
  apiGet<Page<SapReport>>(
    `/admin/reports?${new URLSearchParams({ limit: "50", ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) })}`,
    signal,
  );
export const listActivityAuditEvents = (
  cursor?: string,
  signal?: AbortSignal,
) =>
  apiGet<Page<SapAuditEvent>>(
    `/admin/audit?${new URLSearchParams({ limit: "50", ...(cursor ? { cursor } : {}) })}`,
    signal,
  );

export const activityStatuses: ActivityStatus[] = [
  "draft",
  "registration_open",
  "registration_closed",
  "in_progress",
  "awaiting_result",
  "completed",
  "on_hold",
  "cancelled",
];
const enc = encodeURIComponent;
function invalid(): never {
  throw new ApiError(
    502,
    "INVALID_ACTIVITY_RESPONSE",
    "Informasi kegiatan belum lengkap. Muat ulang untuk mendapatkan data terbaru.",
  );
}
function page<T>(value: Page<T>, validate: (item: T) => T): Page<T> {
  if (
    !value ||
    !Array.isArray(value.items) ||
    !(value.nextCursor === null || typeof value.nextCursor === "string")
  )
    invalid();
  value.items.forEach(validate);
  return value;
}
function activity(value: Activity): Activity {
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.reportId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    !activityStatuses.includes(value.status) ||
    !Number.isInteger(value.acceptedCount) ||
    value.acceptedCount < 0 ||
    !Number.isInteger(value.availableSeats) ||
    value.availableSeats < 0 ||
    !Array.isArray(value.equipment) ||
    !value.actions ||
    Object.values(value.actions).some(
      (permission) => typeof permission?.allowed !== "boolean",
    )
  )
    invalid();
  return value;
}
function member(value: ActivityMember): ActivityMember {
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.displayName !== "string" ||
    !Number.isInteger(value.revision) ||
    !["requested", "accepted", "waitlisted", "rejected", "cancelled"].includes(
      value.status,
    ) ||
    !["unknown", "present", "absent"].includes(value.attendance)
  )
    invalid();
  return value;
}
function result<T extends ActivityResult>(value: T): T {
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.activityId !== "string" ||
    !Number.isInteger(value.revision) ||
    !["submitted", "needs_evidence", "approved", "rejected"].includes(
      value.status,
    ) ||
    !Array.isArray(value.beforeMediaIds) ||
    !Array.isArray(value.afterMediaIds) ||
    !Array.isArray(value.requestedEvidence) ||
    !["partial", "complete"].includes(value.claimedOutcome)
  )
    invalid();
  return value;
}
const headers = (revision: number, key?: string) => ({
  "if-match": String(revision),
  ...(key ? { "idempotency-key": key } : {}),
});
export async function listActivities(
  query: { status?: ActivityStatus; reportId?: string; cursor?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ limit: "12" });
  for (const [key, value] of Object.entries(query))
    if (value) params.set(key, value);
  return page(
    await apiGet<Page<Activity>>(`/admin/activities?${params}`, signal),
    activity,
  );
}
export async function getActivity(id: string, signal?: AbortSignal) {
  return activity(
    await apiGet<Activity>(`/activities/${enc(id)}/manage`, signal),
  );
}
export const getPublicActivity = (id: string, signal?: AbortSignal) =>
  apiGet<R1["PublicActivityDetail"]>(`/activities/${enc(id)}`, signal);
export const listPublicActivities = (cursor?: string, signal?: AbortSignal) =>
  realApiGet<Page<PublicActivity>>(
    `/activities?${new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) })}`,
    signal,
  );
export const getActivityViewer = (id: string, signal?: AbortSignal) =>
  realApiGet<ActivityViewer>(`/activities/${enc(id)}/viewer`, signal);
export const listMyActivities = (cursor?: string, signal?: AbortSignal) =>
  realApiGet<Page<MyActivity>>(
    `/users/me/activities?${new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) })}`,
    signal,
  );
export const listCoordinatorAssignments = (cursor?: string, signal?: AbortSignal) =>
  realApiGet<Page<Activity>>(
    `/users/me/coordinator-assignments?${new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) })}`,
    signal,
  );
export const setActivityMembership = (id: string, participating: boolean) =>
  realApiMutate<R1["Membership"]>("PUT", `/activities/${enc(id)}/membership`, {
    body: { participating },
  });
export const decideCoordinatorAssignment = (
  current: Activity,
  accepted: boolean,
  publishDisplayName: boolean,
) =>
  realApiMutate<Activity>(
    "PUT",
    `/activities/${enc(current.id)}/coordinator-acceptance`,
    {
      body: { accepted, publishDisplayName: accepted && publishDisplayName },
      headers: { "if-match": String(current.revision) },
    },
  );
export const acknowledgeActivitySchedule = (
  id: string,
  scheduleRevision: number,
  confirmed: boolean,
) =>
  realApiMutate<R1["Membership"]>("PUT", `/activities/${enc(id)}/schedule-acknowledgement`, {
    body: { scheduleRevision, confirmed },
  });
export async function createActivity(body: ActivityInput, key: string) {
  return activity(
    await apiMutate<Activity>("POST", "/admin/activities", {
      body,
      headers: { "idempotency-key": key },
    }),
  );
}
export async function updateActivity(current: Activity, body: ActivityInput) {
  return activity(
    await apiMutate<Activity>("PATCH", `/activities/${enc(current.id)}`, {
      body,
      headers: headers(current.revision),
    }),
  );
}
export async function commandActivity(
  current: Activity,
  action: ActivityCommand,
  reason: string | null,
  key: string,
) {
  return activity(
    await apiMutate<Activity>(
      "POST",
      `/activities/${enc(current.id)}/commands`,
      { body: { action, reason }, headers: headers(current.revision, key) },
    ),
  );
}
export const listCandidates = (
  search: string,
  cursor?: string,
  signal?: AbortSignal,
) =>
  apiGet<Page<Candidate>>(
    `/admin/activity-coordinator-candidates?${new URLSearchParams({ search, limit: "20", ...(cursor ? { cursor } : {}) })}`,
    signal,
  );
export async function listMembers(
  id: string,
  status?: MemberStatus,
  cursor?: string,
  signal?: AbortSignal,
) {
  return page(
    await apiGet<Page<ActivityMember>>(
      `/activities/${enc(id)}/memberships?${new URLSearchParams({ limit: "20", ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) })}`,
      signal,
    ),
    member,
  );
}
export async function decideMember(
  current: ActivityMember,
  status: "accepted" | "waitlisted" | "rejected" | "cancelled",
  reason: string,
) {
  return member(
    await apiMutate<ActivityMember>(
      "PATCH",
      `/activities/${enc(current.activityId)}/memberships/${enc(current.id)}`,
      { body: { status, reason }, headers: headers(current.revision) },
    ),
  );
}
export async function recordAttendance(
  current: ActivityMember,
  attendance: ActivityMember["attendance"],
) {
  return member(
    await apiMutate<ActivityMember>(
      "PUT",
      `/activities/${enc(current.activityId)}/memberships/${enc(current.id)}/attendance`,
      { body: { attendance }, headers: headers(current.revision) },
    ),
  );
}
export const listReviewQueue = (cursor?: string, signal?: AbortSignal) =>
  apiGet<Page<ReviewItem>>(
    `/admin/review-queue?${new URLSearchParams({ type: "activity_result", limit: "12", ...(cursor ? { cursor } : {}) })}`,
    signal,
  );
export async function getActivityResult(id: string, signal?: AbortSignal) {
  return result(
    await apiGet<AdminActivityResult>(
      `/admin/activity-results/${enc(id)}`,
      signal,
    ),
  );
}
export async function submitActivityResult(
  current: Activity,
  body: ResultInput,
  key: string,
  previous?: ActivityResult,
) {
  const value = previous
    ? await apiMutate<ActivityResult>(
        "PATCH",
        `/activities/${enc(current.id)}/results/${enc(previous.id)}`,
        { body, headers: headers(previous.revision) },
      )
    : await apiMutate<ActivityResult>(
        "POST",
        `/activities/${enc(current.id)}/results`,
        { body, headers: { "idempotency-key": key } },
      );
  return result(value);
}
export async function decideActivityResult(
  current: ActivityResult,
  body: ResultDecision,
  key: string,
) {
  return result(
    await apiMutate<ActivityResult>(
      "POST",
      `/admin/activity-results/${enc(current.id)}/decisions`,
      { body, headers: headers(current.revision, key) },
    ),
  );
}
export const listPublicResults = (
  id: string,
  cursor?: string,
  signal?: AbortSignal,
) =>
  apiGet<Page<R1["PublicActivityResult"]>>(
    `/activities/${enc(id)}/public-results?${new URLSearchParams({ limit: "12", ...(cursor ? { cursor } : {}) })}`,
    signal,
  );
export const adminSourcePhotoUrl = (
  reportId: string,
  mediaId: string,
  signal?: AbortSignal,
) =>
  apiGet<SapMediaUrl>(
    `/admin/reports/${enc(reportId)}/media/${enc(mediaId)}/url`,
    signal,
  );
export const sourcePhotoUrl = (activityId: string, signal?: AbortSignal) =>
  realApiGet<SapMediaUrl>(
    `/activities/${enc(activityId)}/source-photo/url`,
    signal,
  );
export const resultPhotoUrl = (
  activityId: string,
  resultId: string,
  mediaId: string,
  signal?: AbortSignal,
) =>
  apiGet<SapMediaUrl>(
    `/activities/${enc(activityId)}/results/${enc(resultId)}/media/${enc(mediaId)}/url`,
    signal,
  );
export const measurementPhotoUrl = (
  measurement: Measurement,
  mediaId: string,
  signal?: AbortSignal,
) =>
  apiGet<SapMediaUrl>(
    `/activities/${enc(measurement.activityId)}/measurements/${enc(measurement.id)}/media/${enc(mediaId)}/url`,
    signal,
  );
export const listMeasurements = (
  id: string,
  cursor?: string,
  signal?: AbortSignal,
) =>
  apiGet<Page<Measurement>>(
    `/activities/${enc(id)}/measurements?${new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) })}`,
    signal,
  );
export const decideMeasurement = (
  current: Measurement,
  action: "verify" | "reject",
  reason: string,
  key: string,
) =>
  apiMutate<Measurement>(
    "POST",
    `/admin/measurements/${enc(current.id)}/decisions`,
    { body: { action, reason }, headers: headers(current.revision, key) },
  );
export const listResultRenditions = (
  current: ActivityResult,
  mediaId: string,
  cursor?: string,
  signal?: AbortSignal,
) =>
  apiGet<Page<Rendition>>(
    `/admin/media/${enc(mediaId)}/renditions?${new URLSearchParams({ subjectType: "activity_result", subjectId: current.id, limit: "20", ...(cursor ? { cursor } : {}) })}`,
    signal,
  );
export const createResultRendition = (
  current: ActivityResult,
  mediaId: string,
  redactions: R1["Redaction"][],
  key: string,
) =>
  apiMutate<Rendition>("POST", `/admin/media/${enc(mediaId)}/renditions`, {
    body: { subjectType: "activity_result", subjectId: current.id, redactions },
    headers: headers(current.revision, key),
  });
export async function uploadActivityPhoto(file: File) {
  if (
    file.size > 10 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("Gunakan JPEG, PNG, atau WebP hingga 10 MB.");
  const body = new FormData();
  body.append("file", file);
  body.append("purpose", "activity_evidence");
  return apiMutate<{ id: string }>("POST", "/media", { body });
}
