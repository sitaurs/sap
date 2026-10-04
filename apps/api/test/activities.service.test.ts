import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpException } from '@nestjs/common';
import { ActivitiesService } from '../src/activities/activities.service.js';
import type { ActivityRow, MembershipRow } from '../src/activities/activities.types.js';

const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const REPORT_ID = '22222222-2222-4222-8222-222222222222';
const COORDINATOR_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_ID = '55555555-5555-4555-8555-555555555555';

function exceptionCode(error: unknown): string | undefined {
  const body = (error as HttpException).getResponse?.();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code : undefined;
}

function fullCapacityHarness(acceptedCount: number) {
  const row: ActivityRow = {
    id: ACTIVITY_ID,
    report_id: REPORT_ID,
    coordinator_id: COORDINATOR_ID,
    coordinator_accepted_at: new Date('2026-01-01T00:00:00.000Z'),
    publish_display_name: false,
    revision: 3,
    schedule_revision: 1,
    status: 'registration_open',
    prior_state: null,
    hold_reason: null,
    public_cancel_reason: null,
    public_ever: true,
    data: {
      reportId: REPORT_ID,
      title: 'Bersihkan sungai',
      description: 'Kegiatan membersihkan sampah di sekitar sungai.',
      coordinatorId: COORDINATOR_ID,
      startsAt: '2027-01-10T01:00:00.000Z',
      endsAt: '2027-01-10T04:00:00.000Z',
      registrationClosesAt: '2027-01-09T16:59:00.000Z',
      timezone: 'Asia/Jakarta',
      capacity: 1,
      meetingPoint: { instructions: 'Gerbang taman.', latitude: null, longitude: null },
      equipment: [],
      accessibilityNotes: '',
      wasteHandoverPlan: 'Diserahkan ke bank sampah.',
    },
    result_outcome: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    report_status: 'verified',
    public_visibility: 'public',
    duplicate_of_id: null,
    h3_cell: '8928308280fffff',
    report_occurred_at: new Date('2026-01-01T00:00:00.000Z'),
    report_last_observed_at: null,
    coordinator_name: 'Koordinator SAP',
  };
  const member: MembershipRow = {
    id: MEMBERSHIP_ID,
    activity_id: ACTIVITY_ID,
    user_id: MEMBER_ID,
    revision: 1,
    status: 'requested',
    attendance: 'unknown',
    reason: null,
    schedule_ack_revision: 1,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  };
  const statements: string[] = [];
  const tx = async (parts: TemplateStringsArray) => {
    const sql = parts.join(' ').replace(/\s+/g, ' ').trim();
    statements.push(sql);
    if (sql.startsWith('SELECT a.id,a.created_at FROM activities a WHERE')) return [{ id: row.id, created_at: row.created_at }];
    if (sql.includes('SELECT report_id FROM activities WHERE id=')) return [{ report_id: REPORT_ID }];
    if (sql.includes('SELECT a.*,r.status AS report_status')) return [row];
    if (sql.startsWith('SELECT * FROM activity_memberships WHERE activity_id=')) return [member];
    if (sql.includes('SELECT * FROM activity_memberships WHERE id=') && sql.includes('FOR UPDATE')) return [member];
    if (sql.includes('SELECT id FROM users WHERE id=')) return [{ id: MEMBER_ID }];
    if (sql.includes('SELECT count(*)::text AS count FROM activity_memberships')) return [{ count: String(acceptedCount) }];
    return [];
  };
  const db = {
    begin: async (work: (executor: typeof tx) => Promise<unknown>) => work(tx),
  };
  const service = new ActivitiesService({ db } as never);
  const actor = { id: COORDINATOR_ID, role: 'user', emailVerified: true } as never;
  return { service, actor, member, row, tx, statements };
}

test('membership acceptance rejects a full activity and locks the activity before counting capacity', async () => {
  const h = fullCapacityHarness(1);

  await assert.rejects(
    h.service.decideMembership(actor(h.actor), ACTIVITY_ID, MEMBERSHIP_ID, 1, {
      status: 'accepted',
      reason: 'Kapasitas tersedia.',
    }),
    (error: unknown) => {
      assert.equal(exceptionCode(error), 'ACTIVITY_FULL', JSON.stringify((error as HttpException).getResponse?.()));
      return true;
    },
  );

  const activityLock = h.statements.findIndex(sql => sql.includes('FOR UPDATE OF a'));
  const capacityCount = h.statements.findIndex(sql => sql.includes('SELECT count(*)::text AS count FROM activity_memberships'));
  assert.notEqual(activityLock, -1, 'acceptance must lock the activity row');
  assert.notEqual(capacityCount, -1, 'acceptance must count accepted members');
  assert.ok(activityLock < capacityCount, 'the activity lock must be acquired before the capacity count');
  assert.equal(h.statements.some(sql => sql.startsWith('UPDATE activity_memberships SET status=')), false,
    'a full activity must not change the requested membership');
});

test('activity changes notify only current participants and the coordinator', async () => {
  const statements: string[] = [];
  const recipients: unknown[] = [];
  const tx = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const sql = parts.join(' ').replace(/\s+/g, ' ').trim();
    statements.push(sql);
    if (sql.startsWith('SELECT user_id FROM activity_memberships')) {
      return [{ user_id: MEMBER_ID }, { user_id: '66666666-6666-4666-8666-666666666666' }, { user_id: COORDINATOR_ID }];
    }
    if (sql.startsWith('INSERT INTO notifications')) recipients.push(values[4]);
    return [];
  };
  const service = new ActivitiesService({} as never);

  await service.notifyParticipants(tx as never, ACTIVITY_ID, `activity:${ACTIVITY_ID}:4`, 'activity_changed');

  assert.match(statements[0]!, /status IN \('requested','accepted','waitlisted'\)/);
  assert.doesNotMatch(statements[0]!, /'cancelled'/);
  assert.deepEqual(recipients.sort(), [MEMBER_ID, COORDINATOR_ID, '66666666-6666-4666-8666-666666666666'].sort());
});

test('activity cancellation notifies memberships active immediately before cancellation, not older cancellations', async () => {
  const historicalCancelledUser = '77777777-7777-4777-8777-777777777777';
  const activeBeforeCancellation = [MEMBER_ID, '66666666-6666-4666-8666-666666666666'];
  const row: ActivityRow = {
    id: ACTIVITY_ID,
    report_id: REPORT_ID,
    coordinator_id: COORDINATOR_ID,
    coordinator_accepted_at: new Date('2026-01-01T00:00:00.000Z'),
    publish_display_name: false,
    revision: 3,
    schedule_revision: 1,
    status: 'on_hold',
    prior_state: 'registration_open',
    hold_reason: 'RAHASIA INTERNAL: cuaca masih dievaluasi.',
    public_cancel_reason: null,
    public_ever: true,
    data: {
      reportId: REPORT_ID,
      title: 'Bersihkan sungai',
      description: 'Kegiatan membersihkan sampah di sekitar sungai.',
      coordinatorId: COORDINATOR_ID,
      startsAt: '2027-01-10T01:00:00.000Z',
      endsAt: '2027-01-10T04:00:00.000Z',
      registrationClosesAt: '2027-01-09T16:59:00.000Z',
      timezone: 'Asia/Jakarta',
      capacity: 5,
      meetingPoint: { instructions: 'Gerbang taman.', latitude: null, longitude: null },
      equipment: [],
      accessibilityNotes: '',
      wasteHandoverPlan: 'Diserahkan ke bank sampah.',
    },
    result_outcome: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    report_status: 'verified',
    public_visibility: 'public',
    duplicate_of_id: null,
    h3_cell: '8928308280fffff',
    report_occurred_at: new Date('2026-01-01T00:00:00.000Z'),
    report_last_observed_at: null,
    coordinator_name: 'Koordinator SAP',
  };
  const statements: string[] = [];
  const notifications: { eventKey: unknown; type: unknown; userId: unknown }[] = [];
  const tx = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const sql = parts.join(' ').replace(/\s+/g, ' ').trim();
    statements.push(sql);
    if (sql.startsWith('SELECT report_id FROM activities WHERE id=')) return [{ report_id: REPORT_ID }];
    if (sql.startsWith('SELECT a.*,r.status AS report_status')) return [row];
    if (sql.startsWith('UPDATE activities SET status=')) {
      row.status = 'cancelled';
      row.revision += 1;
      row.hold_reason = values[2] as string | null;
      row.public_cancel_reason = values[3] as string | null;
      return [];
    }
    if (sql.startsWith("UPDATE activity_memberships SET status='cancelled'")) {
      return activeBeforeCancellation.map(user_id => ({ user_id }));
    }
    if (sql.startsWith('INSERT INTO notifications')) notifications.push({ eventKey: values[0], type: values[1], userId: values[4] });
    if (sql.startsWith('SELECT count(*)::text AS count FROM activity_memberships')) return [{ count: '2' }];
    return [];
  };
  const store = {
    db: { begin: async (work: (tx: never) => Promise<unknown>) => work(tx as never) },
    mutate: async (...args: unknown[]) => (args[4] as (tx: never) => Promise<unknown>)(tx as never),
    audit: async () => undefined,
    event: async () => undefined,
  };
  const service = new ActivitiesService(store as never);

  await service.command(actor({ id: COORDINATOR_ID, role: 'user', emailVerified: true }), ACTIVITY_ID, 3,
    '88888888-8888-4888-8888-888888888888', { action: 'cancel', reason: 'Kegiatan dibatalkan karena cuaca.' });

  const membershipUpdate = statements.find(sql => sql.startsWith("UPDATE activity_memberships SET status='cancelled'"));
  assert.match(membershipUpdate!, /status IN \('requested','accepted','waitlisted'\) RETURNING user_id/);
  assert.deepEqual(notifications.map(notification => notification.userId).sort(), [...activeBeforeCancellation, COORDINATOR_ID].sort());
  assert.ok(notifications.every(notification => notification.type === 'activity_cancelled'));
  assert.ok(notifications.every(notification => notification.eventKey === `activity:${ACTIVITY_ID}:4`));
  assert.equal(notifications.some(notification => notification.userId === historicalCancelledUser), false);
  assert.equal(notifications.length, 3);
  assert.equal(row.hold_reason, 'RAHASIA INTERNAL: cuaca masih dievaluasi.', 'cancelling must preserve the private hold/review reason');
  assert.equal(row.public_cancel_reason, 'Kegiatan dibatalkan karena cuaca.');
});

test('private hold/review reasons never appear in public activity or notice DTOs', async () => {
  const h = fullCapacityHarness(0);
  h.row.status = 'on_hold';
  h.row.hold_reason = 'RAHASIA INTERNAL: laporan sedang diperiksa.';

  const publicActivity = await h.service.publicDto(h.tx as never, h.row);
  assert.equal(publicActivity.kind, 'activity');
  assert.equal(publicActivity.cancellationReason, null);
  assert.equal(JSON.stringify(publicActivity).includes(h.row.hold_reason), false);

  h.row.public_visibility = 'private';
  const publicNotice = await h.service.publicDto(h.tx as never, h.row);
  assert.equal(publicNotice.kind, 'activity_notice');
  assert.equal(publicNotice.cancellationReason, null);
  assert.equal(JSON.stringify(publicNotice).includes(h.row.hold_reason), false);
});

test('cancelled participant/public notice exposes only the dedicated public cancellation reason', async () => {
  const h = fullCapacityHarness(0);
  h.row.status = 'cancelled';
  h.row.public_cancel_reason = 'Kegiatan dibatalkan karena cuaca buruk.';
  h.row.hold_reason = 'RAHASIA INTERNAL: ada konflik dalam pemeriksaan sumber.';
  h.row.public_visibility = 'private';

  const notice = await h.service.publicDto(h.tx as never, h.row);
  assert.deepEqual(notice, {
    kind: 'activity_notice',
    id: ACTIVITY_ID,
    status: 'cancelled',
    message: 'Informasi kegiatan sedang ditinjau atau tidak tersedia.',
    cancellationReason: 'Kegiatan dibatalkan karena cuaca buruk.',
    canonicalPath: `/activities/${ACTIVITY_ID}`,
  });
  assert.equal(JSON.stringify(notice).includes(h.row.hold_reason), false);

  h.member.status = 'cancelled';
  const participantService = new ActivitiesService({
    db: h.tx,
    cursor: () => ({ limit: 20, boundary: null, encode: () => '' }),
  } as never);
  const mine = await participantService.mine(actor({ id: MEMBER_ID, role: 'user', emailVerified: true }), {});
  assert.equal(mine.items[0]?.membership?.status, 'cancelled');
  assert.equal(mine.items[0]?.activity.kind, 'activity_notice');
  assert.equal(mine.items[0]?.activity.cancellationReason, 'Kegiatan dibatalkan karena cuaca buruk.');

  h.row.public_visibility = 'public';
  const publicActivity = await h.service.publicDto(h.tx as never, h.row);
  assert.equal(publicActivity.kind, 'activity');
  assert.equal(publicActivity.status, 'cancelled');
  assert.equal(publicActivity.cancellationReason, 'Kegiatan dibatalkan karena cuaca buruk.');
  assert.equal(JSON.stringify(publicActivity).includes(h.row.hold_reason), false);
});

function actor(value: unknown) {
  return value as Parameters<ActivitiesService['decideMembership']>[0];
}
