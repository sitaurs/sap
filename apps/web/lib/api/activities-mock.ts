import { ApiError, type SapAuditEvent, type SapReport } from "./client";
import type {
  Activity,
  ActivityInput,
  ActivityCommand,
  ActivityMember,
  AdminActivityResult,
  ResultInput,
  ResultDecision,
  Measurement,
  Rendition,
  Candidate,
} from "./activities";

// A browser-only development adapter. No fetch, credentials, or production writes.
const KEY = "sap:activities:mock:v1";
const DB = "sap-activities-mock-media";
type Store = {
  version: 1;
  activities: Activity[];
  reports: SapReport[];
  members: ActivityMember[];
  results: AdminActivityResult[];
  renditions: (Rendition & { subjectId: string })[];
  audit: SapAuditEvent[];
  media: Record<string, string>;
  receipts: Record<string, unknown>;
};
let volatile: Store | undefined;
let mutationQueue: Promise<unknown> = Promise.resolve();
const objectUrls = new Map<string, string>();
const clone = <T>(value: T): T => structuredClone(value);
const now = () => new Date().toISOString();
const seedId = (n: number) =>
  `${n.toString(16).padStart(8, "0")}-1000-4000-8000-000000000001`;
function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function fail(code: string, message: string, status = 409): never {
  throw new ApiError(status, code, message);
}
function derive(a: Activity) {
  const active = !["completed", "cancelled"].includes(a.status);
  const ready = !!(
    a.coordinatorAcceptedAt &&
    a.startsAt &&
    a.endsAt &&
    a.capacity &&
    a.meetingPoint &&
    a.wasteHandoverPlan.trim()
  );
  const set = (allowed: boolean, reasonCode = "INVALID_TRANSITION") => ({
    allowed,
    reasonCode: allowed ? null : reasonCode,
  });
  a.availableSeats = Math.max(0, (a.capacity ?? 0) - a.acceptedCount);
  a.actions = {
    edit: set(active),
    cancel: set(active),
    publish: set(
      a.status === "draft" && ready,
      a.coordinatorAcceptedAt
        ? "ACTIVITY_NOT_READY"
        : "COORDINATOR_NOT_ACCEPTED",
    ),
    closeRegistration: set(a.status === "registration_open"),
    start: set(
      ["registration_open", "registration_closed"].includes(a.status) &&
        !!a.startsAt &&
        Date.parse(a.startsAt) <= Date.now(),
    ),
    requestResult: set(a.status === "in_progress"),
    hold: set(
      [
        "registration_open",
        "registration_closed",
        "in_progress",
        "awaiting_result",
      ].includes(a.status),
    ),
    resume: set(a.status === "on_hold"),
  };
  return a;
}
function seed(): Store {
  const today = new Date();
  const date = (days: number, hour: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const titles = [
    "Bersih Sungai Ciliwung",
    "Pilah Sampah Kebon Jeruk",
    "Bersih Taman Menteng",
    "Aksi Bersih Kampung Melayu",
    "Bersih Bantaran Pesanggrahan",
  ];
  const statuses: Activity["status"][] = [
    "registration_open",
    "in_progress",
    "awaiting_result",
    "completed",
    "draft",
  ];
  const counts = [18, 24, 20, 25, 0];
  const media: Store["media"] = {};
  const reports: SapReport[] = [...titles, "Sampah di jalur taman kota"].map(
    (title, i) => {
      const id = seedId(100 + i),
        mediaId = seedId(200 + i);
      media[mediaId] = "/images/activities/mock/source.png";
      return {
        id,
        revision: 1,
        status: "verified",
        categoryId: "plastic",
        scanId: null,
        description: `${title}. Tumpukan sampah plastik memerlukan penanganan bersama warga.`,
        reportedSeverity: "medium",
        location: { latitude: -6.2, longitude: 106.8, accuracyMeters: 15 },
        occurredAt: date(-3, 8),
        createdAt: date(-3, 9),
        updatedAt: date(-2, 9),
        mediaIds: [mediaId],
        resolutionMediaIds: [],
        publicSummary: title,
        publishedMediaIds: [],
        duplicateOfId: null,
        timeline: [],
      };
    },
  );
  const activities: Activity[] = titles.map((title, i) =>
    derive({
      id: seedId(i + 1),
      reportId: reports[i].id,
      revision: 1,
      title,
      description:
        "Aksi relawan membersihkan area, memilah material yang terkumpul, dan menyerahkan sampah kepada pengelola setempat.",
      coordinatorId: seedId(30 + (i % 3)),
      coordinatorAcceptedAt: i === 4 ? null : date(-2, 9),
      startsAt: date(i === 0 || i === 4 ? 7 : -1, 8),
      endsAt: date(i === 0 || i === 4 ? 7 : -1, 11),
      registrationClosesAt: date(i === 0 || i === 4 ? 6 : -2, 18),
      timezone: "Asia/Jakarta",
      status: statuses[i],
      capacity: i === 0 || i === 4 ? 30 : [30, 25, 20, 25][i],
      meetingPoint: {
        instructions: "Berkumpul di pintu masuk taman, dekat posko relawan.",
        latitude: -6.2,
        longitude: 106.8,
      },
      equipment: ["Sarung tangan", "Botol minum pribadi", "Sepatu tertutup"],
      accessibilityNotes:
        "Jalur utama dapat dilalui dengan pendamping. Hubungi koordinator untuk kebutuhan akses.",
      wasteHandoverPlan:
        "Sampah dipilah dan diserahkan kepada pengelola bank sampah setempat.",
      acceptedCount: counts[i],
      availableSeats: 0,
      holdReason: null,
      priorState: null,
      createdAt: date(-3, 10),
      updatedAt: date(-1, 11),
      actions: {} as Activity["actions"],
    }),
  );
  const names = [
    "Ayu Rahma",
    "Bima Pratama",
    "Citra Lestari",
    "Dimas Nugraha",
    "Eka Wulandari",
    "Fajar Saputra",
  ];
  const members: ActivityMember[] = activities.flatMap((a, i) =>
    Array.from({ length: counts[i] + (i === 0 ? 4 : 0) }, (_, j) => ({
      id: seedId(1000 + i * 100 + j),
      activityId: a.id,
      revision: 1,
      status:
        j < counts[i]
          ? ("accepted" as const)
          : j === counts[i] + 3
            ? ("waitlisted" as const)
            : ("requested" as const),
      attendance: i === 3 ? ("present" as const) : ("unknown" as const),
      reason: null,
      createdAt: date(-2, 10),
      updatedAt: date(-2, 10),
      displayName: j < 6 ? names[j] : `Relawan contoh ${j + 1}`,
    })),
  );
  const results: AdminActivityResult[] = [2, 3].map((i) => {
    const before = seedId(300 + i * 10),
      after = seedId(301 + i * 10),
      scale = seedId(302 + i * 10);
    media[before] = "/images/activities/mock/before.png";
    media[after] = "/images/activities/mock/after.png";
    // No fabricated scale photograph: the mock asset is labelled as an illustration.
    media[scale] = "/images/activities/awaiting-result.png";
    return {
      id: seedId(50 + i),
      activityId: activities[i].id,
      reportId: reports[i].id,
      revision: 1,
      status: i === 3 ? "approved" : "submitted",
      observedAt: date(-1, 11),
      description:
        "Jalur utama telah dibersihkan. Sampah telah dipilah untuk diserahkan kepada pengelola. Foto dan berat di sini merupakan data contoh.",
      claimedOutcome: "partial",
      verifiedOutcome: i === 3 ? "partial" : null,
      beforeMediaIds: [before],
      beforePublicEvidenceIds: [],
      afterMediaIds: [after],
      measurement: {
        id: seedId(80 + i),
        revision: 1,
        activityId: activities[i].id,
        physicalBatchId: seedId(90 + i),
        stage: "collected",
        valueKg: i === 3 ? 31.2 : 22.4,
        unit: "kg",
        method: "scale",
        sourceReference: "Catatan timbangan contoh — bukan pengukuran nyata",
        evidenceMediaIds: [scale],
        status: i === 3 ? "verified" : "pending_review",
        measuredAt: date(-1, 11),
        verifiedAt: i === 3 ? date(-1, 12) : null,
        supersedesId: null,
      },
      requestedEvidence: [],
      decisionReason: i === 3 ? "Contoh hasil disetujui sebagian." : null,
      publicSummary:
        i === 3 ? "Jalur utama berhasil dibersihkan bersama 25 relawan." : null,
      approvedResolutionEvidence: [],
      createdAt: date(-1, 11),
      updatedAt: date(-1, 12),
      latestReview: null,
    };
  });
  return {
    version: 1,
    activities,
    reports,
    members,
    results,
    renditions: [],
    media,
    receipts: {},
    audit: activities.map((a) => ({
      id: newId(),
      targetId: a.id,
      action: "activity.created",
      actorDisplayName: "Admin contoh",
      createdAt: a.createdAt,
    })),
  };
}
function load(): Store {
  if (
    typeof window === "undefined" ||
    process.env.NODE_ENV !== "development" ||
    process.env.NEXT_PUBLIC_SAP_ACTIVITIES_MOCK !== "1"
  )
    fail(
      "MOCK_DISABLED",
      "Mode mock hanya tersedia pada server development.",
      503,
    );
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (
        parsed.version === 1 &&
        Array.isArray(parsed.activities) &&
        Array.isArray(parsed.results) &&
        Array.isArray(parsed.members) &&
        parsed.media &&
        parsed.receipts
      )
        return parsed;
    }
  } catch {
    /* Storage may be disabled by browser settings. */
  }
  return (volatile ??= seed());
}
function save(store: Store) {
  volatile = store;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    fail(
      "MOCK_STORAGE_FULL",
      "Penyimpanan mock browser tidak tersedia. Izinkan penyimpanan situs agar perubahan tersimpan.",
      507,
    );
  }
}
function find<T extends { id: string }>(items: T[], id: string): T {
  return (
    items.find((x) => x.id === id) ??
    fail(
      "NOT_FOUND",
      "Data contoh tidak ditemukan. Kembali ke daftar kegiatan.",
      404,
    )
  );
}
function revision(
  value: { revision: number },
  headers?: Record<string, string>,
) {
  if (String(value.revision) !== headers?.["if-match"])
    fail("REVISION_CONFLICT", "Versi data contoh sudah berubah.");
}
function changed(
  store: Store,
  value: { id: string; revision: number; updatedAt: string },
  action: string,
  targetId = value.id,
) {
  value.revision += 1;
  value.updatedAt = now();
  store.audit.unshift({
    id: newId(),
    action,
    targetId,
    actorDisplayName: "Admin contoh",
    createdAt: value.updatedAt,
  });
}
function page<T>(items: T[], params: URLSearchParams) {
  const offset = Math.max(0, Number(params.get("cursor")) || 0),
    limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 20));
  return {
    items: items.slice(offset, offset + limit),
    nextCursor: offset + limit < items.length ? String(offset + limit) : null,
  };
}
function mediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("media");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error("Penyimpanan foto mock belum tersedia pada browser ini."),
      );
  });
}
async function putBlob(id: string, blob: Blob) {
  const db = await mediaDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("media", "readwrite");
      tx.objectStore("media").put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error("Foto mock tidak dapat disimpan di browser."));
      tx.onabort = () => reject(new Error("Penyimpanan foto mock dibatalkan."));
    });
  } finally {
    db.close();
  }
}
async function urlFor(store: Store, id: string) {
  if (store.media[id]) return store.media[id];
  if (objectUrls.has(id)) return objectUrls.get(id)!;
  const db = await mediaDb();
  try {
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db.transaction("media").objectStore("media").get(id);
      request.onsuccess = () => resolve(request.result as Blob | undefined);
      request.onerror = () =>
        reject(new Error("Foto mock belum dapat dimuat."));
    });
    if (!blob) fail("NOT_FOUND", "Foto contoh tidak tersedia.", 404);
    const url = URL.createObjectURL(blob);
    objectUrls.set(id, url);
    return url;
  } finally {
    db.close();
  }
}
async function renderRendition(
  store: Store,
  mediaId: string,
  redactions: Rendition["redactions"],
) {
  const image = new Image();
  image.src = await urlFor(store, mediaId);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser belum mendukung pengolahan foto mock.");
  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = "#183b35";
  for (const box of redactions)
    ctx.fillRect(
      box.x * canvas.width,
      box.y * canvas.height,
      box.width * canvas.width,
      box.height * canvas.height,
    );
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Versi foto mock gagal dibuat.")),
      "image/png",
    ),
  );
}
export function resetActivitiesMock() {
  const fresh = seed();
  save(fresh);
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
  // The mock owns only this database; never touches API or account storage.
  indexedDB.deleteDatabase(DB);
}
export function acceptMockCoordinator(id: string): Activity {
  const store = load(),
    a = find(store.activities, id);
  if (!a.coordinatorId)
    fail(
      "ACTIVITY_NOT_READY",
      "Pilih koordinator pada form kegiatan terlebih dahulu.",
    );
  a.coordinatorAcceptedAt = now();
  changed(store, a, "activity.coordinator_accepted.mock");
  derive(a);
  save(store);
  return clone(a);
}
type MockOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};
export function mockActivityRequest<T>(
  method: string,
  path: string,
  options: MockOptions = {},
): Promise<T> {
  if (method === "GET") return executeMockRequest<T>(method, path, options);
  const request = mutationQueue.then(() =>
    executeMockRequest<T>(method, path, options),
  );
  mutationQueue = request.catch(() => undefined);
  return request;
}
async function executeMockRequest<T>(
  method: string,
  path: string,
  options: MockOptions,
): Promise<T> {
  options.signal?.throwIfAborted();
  const store = load();
  const u = new URL(path, "http://sap-mock.invalid"),
    p = u.pathname.split("/").filter(Boolean),
    q = u.searchParams;
  const receipt = options.headers?.["idempotency-key"],
    receiptKey = receipt ? `${method}:${u.pathname}:${receipt}` : null;
  if (
    method !== "GET" &&
    receiptKey &&
    Object.hasOwn(store.receipts, receiptKey)
  )
    return clone(store.receipts[receiptKey]) as T;
  let out: unknown;
  if (method === "GET" && u.pathname === "/admin/activities") {
    out = page(
      store.activities
        .map(derive)
        .filter(
          (a) =>
            (!q.get("status") || a.status === q.get("status")) &&
            (!q.get("reportId") || a.reportId === q.get("reportId")),
        ),
      q,
    );
  } else if (method === "POST" && u.pathname === "/admin/activities") {
    const input = options.body as ActivityInput;
    find(store.reports, input.reportId);
    if (
      store.activities.some(
        (a) =>
          a.reportId === input.reportId &&
          !["cancelled", "completed", "draft"].includes(a.status),
      )
    )
      fail(
        "ACTIVE_ACTIVITY_EXISTS",
        "Laporan contoh sudah mempunyai kegiatan aktif.",
      );
    const a = derive({
      ...clone(input),
      id: newId(),
      revision: 1,
      status: "draft",
      coordinatorAcceptedAt: null,
      acceptedCount: 0,
      availableSeats: 0,
      holdReason: null,
      priorState: null,
      createdAt: now(),
      updatedAt: now(),
      actions: {} as Activity["actions"],
    });
    store.activities.unshift(a);
    out = a;
    store.audit.unshift({
      id: newId(),
      action: "activity.created",
      targetId: a.id,
      actorDisplayName: "Admin contoh",
      createdAt: now(),
    });
  } else if (method === "GET" && u.pathname === "/admin/reports") {
    out = page(store.reports, q);
  } else if (method === "GET" && p[0] === "reports" && p.length === 2) {
    out = find(store.reports, p[1]);
  } else if (method === "GET" && u.pathname === "/admin/audit") {
    out = page(store.audit, q);
  } else if (
    method === "GET" &&
    u.pathname === "/admin/activity-coordinator-candidates"
  ) {
    const candidates: Candidate[] = [
      "Rina Putri",
      "Andi Pratama",
      "Dewi Lestari",
    ].map((displayName, i) => ({ id: seedId(30 + i), displayName }));
    out = page(
      candidates.filter((c) =>
        c.displayName
          .toLowerCase()
          .includes((q.get("search") || "").toLowerCase()),
      ),
      q,
    );
  } else if (method === "GET" && u.pathname === "/admin/review-queue") {
    out = page(
      store.results
        .filter((r) => ["submitted", "needs_evidence"].includes(r.status))
        .map((r) => ({
          subjectType: "activity_result",
          subjectId: r.id,
          subjectRevision: r.revision,
          reportId: r.reportId,
          title: find(store.activities, r.activityId).title,
          submittedAt: r.updatedAt,
          reviewState:
            r.status === "needs_evidence" ? "needs_evidence" : "pending",
          latestReview: null,
        })),
      q,
    );
  } else if (method === "GET" && p.at(-1) === "url") {
    out = {
      url: await urlFor(store, p.at(-2)!),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  } else if (method === "POST" && u.pathname === "/media") {
    const file = (options.body as FormData).get("file");
    if (!(file instanceof File))
      fail("INVALID_MEDIA", "Pilih foto untuk data contoh.", 400);
    const id = newId();
    await putBlob(id, file);
    out = { id };
  } else if (p[0] === "admin" && p[1] === "media" && p[3] === "renditions") {
    if (method === "GET") {
      const renditions = store.renditions.filter(
        (r) => r.mediaId === p[2] && r.subjectId === q.get("subjectId"),
      );
      out = page(
        await Promise.all(
          renditions.map(async (r) => ({
            ...r,
            url: await urlFor(store, r.id),
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          })),
        ),
        q,
      );
    } else if (method === "POST") {
      const body = options.body as {
        subjectId: string;
        redactions: Rendition["redactions"];
      };
      const result = find(store.results, body.subjectId);
      revision(result, options.headers);
      if (![...result.beforeMediaIds, ...result.afterMediaIds].includes(p[2]))
        fail(
          "EVIDENCE_INVALID",
          "Foto harus berasal dari hasil kegiatan yang dipilih.",
        );
      const id = newId();
      await putBlob(id, await renderRendition(store, p[2], body.redactions));
      const r: Rendition & { subjectId: string } = {
        id,
        mediaId: p[2],
        revision: 1,
        status: "ready",
        url: await urlFor(store, id),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        redactions: clone(body.redactions),
        subjectId: result.id,
      };
      store.renditions.unshift(r);
      out = r;
    }
  } else if (
    p[0] === "admin" &&
    p[1] === "measurements" &&
    p[3] === "decisions"
  ) {
    const r = store.results.find((x) => x.measurement?.id === p[2]);
    if (!r?.measurement)
      fail("NOT_FOUND", "Berat contoh tidak ditemukan.", 404);
    const m = r.measurement;
    revision(m, options.headers);
    const body = options.body as {
      action: "verify" | "reject";
      reason: string;
    };
    if (!body.reason.trim())
      fail("VALIDATION_FAILED", "Tuliskan alasan keputusan berat.", 400);
    m.status = body.action === "verify" ? "verified" : "rejected";
    m.verifiedAt = body.action === "verify" ? now() : null;
    m.revision += 1;
    out = m;
  } else if (p[0] === "admin" && p[1] === "activity-results") {
    const r = find(store.results, p[2]);
    if (method === "GET" && p.length === 3) out = r;
    else if (method === "POST" && p[3] === "decisions") {
      revision(r, options.headers);
      const body = options.body as ResultDecision;
      if (!body.reason.trim())
        fail("VALIDATION_FAILED", "Tuliskan alasan keputusan.", 400);
      for (const approval of body.publicEvidenceApprovals) {
        const rendition = find(store.renditions, approval.renditionId);
        if (
          rendition.subjectId !== r.id ||
          rendition.mediaId !== approval.mediaId ||
          rendition.status !== "ready"
        )
          fail(
            "EVIDENCE_INVALID",
            "Pilih versi foto mock yang siap dan sesuai hasil.",
          );
      }
      if (
        body.action === "approve" &&
        body.verifiedOutcome === "complete" &&
        !body.publicEvidenceApprovals.some(
          (x) =>
            r.afterMediaIds.includes(x.mediaId) && x.channels.includes("web"),
        )
      )
        fail(
          "RESOLUTION_EVIDENCE_REQUIRED",
          "Hasil selesai memerlukan foto sesudah untuk web.",
        );
      r.status =
        body.action === "approve"
          ? "approved"
          : body.action === "reject"
            ? "rejected"
            : "needs_evidence";
      r.decisionReason = body.reason;
      r.verifiedOutcome =
        body.action === "approve" ? body.verifiedOutcome : null;
      r.publicSummary = body.action === "approve" ? body.publicSummary : null;
      r.requestedEvidence = body.requestedEvidence;
      changed(store, r, `activity_result.${body.action}`, r.activityId);
      if (body.action === "approve") {
        const a = find(store.activities, r.activityId);
        a.status = "completed";
        changed(store, a, "activity.completed");
        derive(a);
      }
      out = r;
    }
  } else if (p[0] === "activities") {
    const a = find(store.activities, p[1]);
    derive(a);
    if (method === "GET" && p[2] === "manage") out = a;
    else if (method === "GET" && p.length === 2)
      out = {
        kind: "activity",
        ...a,
        coordinatorDisplayName: ["Rina Putri", "Andi Pratama", "Dewi Lestari"][
          Math.max(
            0,
            [seedId(30), seedId(31), seedId(32)].indexOf(a.coordinatorId || ""),
          )
        ],
        area: { cellId: "mock", label: "Area contoh" },
        registrationOpen: a.status === "registration_open",
        resultOutcome: null,
        canonicalPath: `/dashboard?view=admin-activities&activityScreen=detail&activity=${a.id}`,
      };
    else if (method === "PATCH" && p.length === 2) {
      revision(a, options.headers);
      if (!a.actions.edit.allowed)
        fail("INVALID_TRANSITION", "Kegiatan selesai tidak dapat diedit.");
      const body = options.body as ActivityInput;
      if (body.coordinatorId !== a.coordinatorId) {
        if (!["draft", "on_hold"].includes(a.status))
          fail(
            "COORDINATOR_REASSIGNMENT_REQUIRES_HOLD",
            "Tunda kegiatan sebelum mengganti koordinator.",
          );
        a.coordinatorAcceptedAt = null;
      }
      if (body.capacity !== null && body.capacity < a.acceptedCount)
        fail(
          "ACTIVITY_FULL",
          "Kuota tidak boleh lebih kecil dari peserta yang diterima.",
        );
      Object.assign(a, clone(body));
      changed(store, a, "activity.updated");
      out = derive(a);
    } else if (method === "POST" && p[2] === "commands") {
      revision(a, options.headers);
      const body = options.body as {
        action: ActivityCommand;
        reason: string | null;
      };
      const map = {
        publish: "publish",
        close_registration: "closeRegistration",
        start: "start",
        request_result: "requestResult",
        hold: "hold",
        resume: "resume",
        cancel: "cancel",
      } as const;
      const permission = a.actions[map[body.action]];
      if (!permission?.allowed)
        fail(
          permission?.reasonCode || "INVALID_TRANSITION",
          "Tindakan tidak tersedia pada status contoh ini.",
        );
      if (
        ["hold", "resume", "cancel"].includes(body.action) &&
        !body.reason?.trim()
      )
        fail("VALIDATION_FAILED", "Tuliskan alasan perubahan status.", 400);
      if (body.action === "hold") {
        a.priorState = a.status;
        a.status = "on_hold";
        a.holdReason = body.reason;
      } else if (body.action === "resume") {
        a.status = a.priorState ?? "registration_open";
        a.priorState = null;
        a.holdReason = null;
      } else
        a.status = (
          {
            publish: "registration_open",
            close_registration: "registration_closed",
            start: "in_progress",
            request_result: "awaiting_result",
            cancel: "cancelled",
          } as const
        )[body.action];
      changed(store, a, `activity.${body.action}`);
      out = derive(a);
    } else if (p[2] === "memberships") {
      if (method === "GET")
        out = page(
          store.members.filter(
            (m) =>
              m.activityId === a.id &&
              (!q.get("status") || m.status === q.get("status")),
          ),
          q,
        );
      else {
        const m = find(
          store.members.filter((x) => x.activityId === a.id),
          p[3],
        );
        revision(m, options.headers);
        if (method === "PATCH" && p.length === 4) {
          const body = options.body as Pick<
            ActivityMember,
            "status" | "reason"
          >;
          if (!body.reason?.trim())
            fail(
              "VALIDATION_FAILED",
              "Tuliskan alasan keputusan peserta.",
              400,
            );
          if (
            body.status === "accepted" &&
            (!a.startsAt ||
              Date.parse(a.startsAt) <= Date.now() ||
              !["registration_open", "registration_closed"].includes(a.status))
          )
            fail("MEMBERSHIP_CLOSED", "Pendaftaran kegiatan sudah ditutup.");
          if (body.status === "accepted" && a.availableSeats < 1)
            fail("ACTIVITY_FULL", "Kuota contoh sudah penuh.");
          const allowed = ["requested", "waitlisted"].includes(m.status)
            ? ["accepted", "waitlisted", "rejected", "cancelled"]
            : m.status === "accepted" &&
                !["completed", "cancelled"].includes(a.status)
              ? ["cancelled"]
              : [];
          if (!allowed.includes(body.status) || body.status === m.status)
            fail("INVALID_TRANSITION", "Keputusan peserta tidak tersedia.");
          if (m.status === "accepted") a.acceptedCount -= 1;
          if (body.status === "accepted") a.acceptedCount += 1;
          m.status = body.status;
          m.reason = body.reason;
          changed(store, a, "activity.membership_changed");
          derive(a);
        } else if (method === "PUT" && p[4] === "attendance") {
          if (
            m.status !== "accepted" ||
            !["in_progress", "awaiting_result", "completed"].includes(a.status)
          )
            fail(
              "INVALID_TRANSITION",
              "Kehadiran tersedia untuk peserta yang diterima saat kegiatan berlangsung.",
            );
          m.attendance = (
            options.body as Pick<ActivityMember, "attendance">
          ).attendance;
        } else
          fail(
            "MOCK_ROUTE_UNSUPPORTED",
            "Tindakan peserta belum tersedia pada mock.",
            400,
          );
        changed(store, m, "activity.member_updated", a.id);
        out = m;
      }
    } else if (method === "GET" && p[2] === "measurements")
      out = page(
        store.results
          .filter((r) => r.activityId === a.id && r.measurement)
          .map((r) => r.measurement!),
        q,
      );
    else if (method === "GET" && p[2] === "public-results")
      out = page(
        store.results
          .filter((r) => r.activityId === a.id && r.status === "approved")
          .map((r) => ({
            id: r.id,
            activityId: r.activityId,
            reportId: r.reportId,
            summary: r.publicSummary,
            outcome: r.verifiedOutcome,
            observedAt: r.observedAt,
            evidence: [],
            verifiedMeasurement:
              r.measurement?.status === "verified"
                ? { valueKg: r.measurement.valueKg }
                : null,
          })),
        q,
      );
    else if (p[2] === "results" && ["POST", "PATCH"].includes(method)) {
      const body = options.body as ResultInput;
      if (!["in_progress", "awaiting_result"].includes(a.status))
        fail(
          "INVALID_TRANSITION",
          "Pengiriman hasil tersedia untuk kegiatan yang berlangsung atau menunggu hasil.",
        );
      const existing =
        method === "PATCH"
          ? find(
              store.results.filter((r) => r.activityId === a.id),
              p[3],
            )
          : undefined;
      if (existing) {
        revision(existing, options.headers);
        if (!["submitted", "needs_evidence"].includes(existing.status))
          fail(
            "INVALID_TRANSITION",
            "Hasil yang sudah ditinjau tidak dapat diedit.",
          );
      }
      const measurement: Measurement | null = body.measurement
        ? {
            ...clone(body.measurement),
            id: newId(),
            revision: 1,
            activityId: a.id,
            physicalBatchId: body.measurement.physicalBatchId ?? newId(),
            unit: "kg",
            method: "scale",
            status: "pending_review",
            verifiedAt: null,
            supersedesId: existing?.measurement?.id ?? null,
          }
        : null;
      const r: AdminActivityResult = {
        ...clone(body),
        id: existing?.id ?? newId(),
        activityId: a.id,
        reportId: a.reportId,
        revision: existing?.revision ?? 1,
        status: "submitted",
        verifiedOutcome: null,
        measurement,
        requestedEvidence: [],
        decisionReason: null,
        publicSummary: null,
        approvedResolutionEvidence: [],
        latestReview: null,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
      if (existing) {
        changed(store, r, "activity_result.updated", a.id);
        store.results = store.results.map((x) => (x.id === r.id ? r : x));
      } else store.results.unshift(r);
      out = r;
    }
  }
  if (out === undefined)
    fail(
      "MOCK_ROUTE_UNSUPPORTED",
      "Tindakan ini belum tersedia di mode mock kegiatan.",
      400,
    );
  options.signal?.throwIfAborted();
  if (method !== "GET") {
    if (receiptKey) store.receipts[receiptKey] = clone(out);
    save(store);
  } else if (!localStorage.getItem(KEY)) save(store);
  return clone(out) as T;
}
