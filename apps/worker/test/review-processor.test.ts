import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReviewResult } from '../src/review-processor.js';

const row = {
  subject_type: 'report',
  subject_id: '11111111-1111-4111-8111-111111111111',
  subject_revision: 4,
  report_id: '22222222-2222-4222-8222-222222222222',
  source_report_revision: 9,
  snapshot_hash: 'a'.repeat(64),
  snapshot: {
    evidence: [{ mediaId: '33333333-3333-4333-8333-333333333333' }],
    duplicateCandidates: [{ id: '44444444-4444-4444-8444-444444444444' }],
  },
};

function result() {
  return {
    schemaVersion: 'sap-evidence-review-v1',
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    subjectRevision: row.subject_revision,
    sourceReportId: row.report_id,
    sourceReportRevision: row.source_report_revision,
    snapshotHash: row.snapshot_hash,
    recommendation: 'human_review',
    reasonCodes: ['MORE_EVIDENCE_REQUIRED'],
    evidence: [{ mediaId: row.snapshot.evidence[0]!.mediaId, observation: 'Foto menunjukkan sampah di tepi jalan.' }],
    duplicateCandidates: [],
    missingEvidence: ['Foto dari sisi lokasi yang lebih luas.'],
    publicSummaryProposal: null,
    publicationWarnings: [],
  };
}

function rejects(value: unknown, expectedRow = row) {
  assert.throws(
    () => validateReviewResult(value, expectedRow),
    (error: unknown) => error instanceof Error && error.message === 'HERMES_INVALID_RESPONSE',
  );
}

test('accepts a bounded recommendation tied to the exact report and snapshot', () => {
  assert.doesNotThrow(() => validateReviewResult(result(), row));
});

test('rejects missing fields and provider-added fields', () => {
  const missing = result() as Record<string, unknown>;
  delete missing.publicationWarnings;
  rejects(missing);

  rejects({ ...result(), decision: 'approve' });
});

test('rejects a stale or cross-subject result', () => {
  rejects({ ...result(), subjectRevision: row.subject_revision - 1 });
  rejects({ ...result(), sourceReportId: '55555555-5555-4555-8555-555555555555' });
  rejects({ ...result(), snapshotHash: 'b'.repeat(64) });
});

test('rejects evidence not present in the immutable input snapshot', () => {
  rejects({ ...result(), evidence: [{ mediaId: '55555555-5555-4555-8555-555555555555', observation: 'Asumsi.' }] });
  rejects({ ...result(), evidence: [
    result().evidence[0],
    result().evidence[0],
  ] });
  rejects({ ...result(), evidence: [{ ...result().evidence[0], ownerId: 'admin' }] });
});

test('rejects invented reason codes and duplicate reason codes', () => {
  rejects({ ...result(), reasonCodes: ['APPROVE_REPORT'] });
  rejects({ ...result(), reasonCodes: ['MORE_EVIDENCE_REQUIRED', 'MORE_EVIDENCE_REQUIRED'] });
});

test('accepts only duplicate candidates present in the input snapshot', () => {
  assert.doesNotThrow(() => validateReviewResult({
    ...result(), recommendation: 'recommend_duplicate',
    duplicateCandidates: [row.snapshot.duplicateCandidates[0]!.id],
  }, row));

  rejects({ ...result(), recommendation: 'recommend_duplicate', duplicateCandidates: [] });
  rejects({ ...result(), duplicateCandidates: ['55555555-5555-4555-8555-555555555555'] });
});

test('does not allow duplicate recommendations for non-report review subjects', () => {
  const activityRow = { ...row, subject_type: 'activity_result' };
  rejects({ ...result(), subjectType: activityRow.subject_type, recommendation: 'recommend_duplicate' }, activityRow);
});

test('enforces bounded arrays and proposal text before persistence', () => {
  rejects({ ...result(), missingEvidence: ['x'.repeat(301)] });
  rejects({ ...result(), publicationWarnings: Array.from({ length: 6 }, () => 'warning') });
  rejects({ ...result(), publicSummaryProposal: 'x'.repeat(501) });
});
