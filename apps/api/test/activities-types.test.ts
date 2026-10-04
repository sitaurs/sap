import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpException } from '@nestjs/common';
import { activityInput, measurementInput, queryBool, resultInput, weight } from '../src/activities/activities.types.js';

const REPORT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const MEDIA_BEFORE = '33333333-3333-4333-8333-333333333333';
const MEDIA_AFTER = '44444444-4444-4444-8444-444444444444';
const BATCH = '55555555-5555-4555-8555-555555555555';

function errorCode(error: unknown): string {
  const body = (error as HttpException).getResponse?.();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code ?? '' : '';
}

function rejectsValidation(work: () => unknown) {
  assert.throws(work, (error: unknown) => errorCode(error) === 'VALIDATION_ERROR');
}

function activity(over: Record<string, unknown> = {}) {
  return {
    reportId: REPORT,
    title: 'Bersihkan sungai',
    description: 'Kegiatan membersihkan sampah di sekitar sungai.',
    coordinatorId: USER,
    startsAt: '2026-01-10T08:00:00+07:00',
    endsAt: '2026-01-10T11:00:00+07:00',
    registrationClosesAt: '2026-01-09T23:59:00+07:00',
    timezone: 'Asia/Jakarta',
    capacity: 20,
    meetingPoint: { instructions: 'Berkumpul di gerbang taman.', latitude: -6.2, longitude: 106.8 },
    equipment: ['sarung tangan', 'kantong sampah'],
    accessibilityNotes: '',
    wasteHandoverPlan: 'Sampah diserahkan ke bank sampah setempat.',
    ...over,
  };
}

test('activityInput accepts a valid Jakarta activity and normalizes timestamps', () => {
  const parsed = activityInput(activity());
  assert.equal(parsed.timezone, 'Asia/Jakarta');
  assert.equal(parsed.startsAt, '2026-01-10T01:00:00.000Z');
  assert.equal(parsed.endsAt, '2026-01-10T04:00:00.000Z');
  assert.deepEqual(parsed.meetingPoint, { instructions: 'Berkumpul di gerbang taman.', latitude: -6.2, longitude: 106.8 });
});

test('activityInput rejects unknown fields and unsupported timezone values', () => {
  rejectsValidation(() => activityInput(activity({ adminOverride: true })));
  rejectsValidation(() => activityInput(activity({ timezone: 'UTC' })));
});

test('activityInput enforces event and registration chronology', () => {
  rejectsValidation(() => activityInput(activity({ endsAt: '2026-01-10T08:00:00+07:00' })));
  rejectsValidation(() => activityInput(activity({ registrationClosesAt: '2026-01-10T08:01:00+07:00' })));
});

test('activityInput requires meeting-point coordinates as a valid pair', () => {
  rejectsValidation(() => activityInput(activity({ meetingPoint: { instructions: 'Gerbang taman.', latitude: -6.2, longitude: null } })));
  rejectsValidation(() => activityInput(activity({ meetingPoint: { instructions: 'Gerbang taman.', latitude: 91, longitude: 106.8 } })));
});

test('activityInput bounds capacity and cleans text fields', () => {
  const parsed = activityInput(activity({ title: '  Bersihkan sungai  ', capacity: null }));
  assert.equal(parsed.title, 'Bersihkan sungai');
  assert.equal(parsed.capacity, null);
  rejectsValidation(() => activityInput(activity({ capacity: 201 })));
  rejectsValidation(() => activityInput(activity({ capacity: 1.5 })));
});

test('weight accepts zero and three-decimal precision but rejects invalid values', () => {
  assert.equal(weight(0), 0);
  assert.equal(weight(12.345), 12.345);
  assert.equal(weight(100000), 100000);
  for (const value of [-0.001, 100000.001, 1.0001, Number.NaN, Number.POSITIVE_INFINITY, '1']) {
    rejectsValidation(() => weight(value));
  }
});

test('measurementInput requires a supported method, stage, batch ID and evidence IDs', () => {
  const value = {
    physicalBatchId: BATCH,
    stage: 'collected',
    valueKg: 12.5,
    measuredAt: '2025-10-04T10:00:00+07:00',
    method: 'scale',
    sourceReference: 'Timbangan posko 1',
    evidenceMediaIds: [MEDIA_AFTER],
  };
  assert.equal(measurementInput(value).measuredAt, '2025-10-04T03:00:00.000Z');
  rejectsValidation(() => measurementInput({ ...value, method: 'estimate' }));
  rejectsValidation(() => measurementInput({ ...value, stage: 'stored' }));
  rejectsValidation(() => measurementInput({ ...value, evidenceMediaIds: [MEDIA_AFTER, MEDIA_AFTER] }));
});

test('resultInput requires before and after evidence and disallows reusing the same media', () => {
  const value = {
    observedAt: '2025-10-04T10:00:00+07:00',
    description: 'Kondisi sungai setelah kegiatan dibersihkan bersama warga.',
    claimedOutcome: 'partial',
    beforeMediaIds: [MEDIA_BEFORE],
    beforePublicEvidenceIds: [],
    afterMediaIds: [MEDIA_AFTER],
    measurement: null,
  };
  assert.equal(resultInput(value).claimedOutcome, 'partial');
  rejectsValidation(() => resultInput({ ...value, beforeMediaIds: [], beforePublicEvidenceIds: [] }));
  rejectsValidation(() => resultInput({ ...value, afterMediaIds: [] }));
  rejectsValidation(() => resultInput({ ...value, afterMediaIds: [MEDIA_BEFORE] }));
});

test('queryBool accepts only the documented boolean encodings', () => {
  assert.equal(queryBool(undefined), false);
  assert.equal(queryBool(true), true);
  assert.equal(queryBool(false), false);
  assert.equal(queryBool('true'), true);
  assert.equal(queryBool('false'), false);
  rejectsValidation(() => queryBool('yes'));
});
