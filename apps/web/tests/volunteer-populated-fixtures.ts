import type { R1 } from "../lib/api/r1";
import { activity, managed, membership } from "./r1-fixtures";

/** Synthetic populated UI contracts. Never imported by application code. */
export const populatedActivities: R1["PublicActivity"][] = [
  { ...activity, title: "Bersih-bersih bantaran sungai", startsAt: "2026-10-12T00:00:00Z", endsAt: "2026-10-12T03:00:00Z", area: { cellId: "fixture-lowokwaru", label: "Lowokwaru, Malang" }, capacity: 10, acceptedCount: 2, availableSeats: 8 },
  { ...activity, id: "00000003-1000-4000-8000-000000000004", title: "Penanaman pohon bersama", startsAt: "2026-10-20T01:00:00Z", endsAt: "2026-10-20T04:00:00Z", area: { cellId: "fixture-klojen", label: "Klojen, Malang" }, capacity: 15, acceptedCount: 3, availableSeats: 12 },
  { ...activity, id: "00000003-1000-4000-8000-000000000005", title: "Aksi bersih sampah organik", startsAt: "2026-10-08T01:00:00Z", endsAt: "2026-10-08T04:00:00Z", area: { cellId: "fixture-sukun", label: "Sukun, Malang" }, status: "completed", registrationOpen: false, capacity: 5, acceptedCount: 5, availableSeats: 0 },
  { ...activity, id: "00000003-1000-4000-8000-000000000006", title: "Aksi bersih taman lingkungan", startsAt: "2026-10-05T00:00:00Z", endsAt: "2026-10-05T03:00:00Z", area: { cellId: "fixture-blimbing", label: "Blimbing, Malang" }, status: "cancelled", registrationOpen: false },
];
const reserveActivity: R1["PublicActivity"] = { ...activity, id: "00000003-1000-4000-8000-000000000007", title: "Aksi bersih lingkungan warga", startsAt: "2026-10-24T00:00:00Z", endsAt: "2026-10-24T03:00:00Z", area: { cellId: "fixture-blimbing", label: "Blimbing, Malang" } };
export const populatedRegistrations: R1["MyActivity"][] = [
  { activity: populatedActivities[0], membership: { ...membership, status: "accepted" }, isCoordinator: false },
  { activity: populatedActivities[1], membership: { ...membership, activityId: populatedActivities[1].id, status: "requested" }, isCoordinator: false },
  { activity: reserveActivity, membership: { ...membership, activityId: reserveActivity.id, status: "waitlisted" }, isCoordinator: false },
];
export const populatedAssignments: R1["ManagedActivity"][] = [
  { ...managed, id: "00000003-1000-4000-8000-000000000008", title: "Bersih-bersih taman kota", startsAt: "2026-10-17T00:00:00Z", endsAt: "2026-10-17T03:00:00Z", status: "draft", capacity: 20 },
  { ...managed, id: "00000003-1000-4000-8000-000000000009", title: "Pemilahan sampah komunitas", startsAt: "2026-10-18T01:00:00Z", endsAt: "2026-10-18T04:00:00Z", capacity: 20, coordinatorAcceptedAt: "2026-10-09T01:00:00Z" },
];
