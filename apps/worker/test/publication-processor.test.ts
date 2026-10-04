import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPublicationAsset } from '../src/publication-processor.js';

test('automatic initial drafts select only Instagram-approved evidence attached to the report', () => {
  const reportId = 'report-1';
  const assets = [
    { media_id: 'update-photo', subject_type: 'community_update', subject_id: 'update-1' },
    { media_id: 'result-photo', subject_type: 'activity_result', subject_id: 'result-1' },
    { media_id: 'report-photo', subject_type: 'report', subject_id: reportId },
  ];
  const initialSources = [{ subject_type: 'report', subject_id: reportId }];

  assert.equal(selectPublicationAsset(assets.slice(0, 2), initialSources), undefined);
  assert.equal(selectPublicationAsset(assets, initialSources)?.media_id, 'report-photo');
});

test('resolution drafts continue to require the approved milestone evidence source', () => {
  const sources = [{ media_id: 'after-photo', subject_type: 'activity_result', subject_id: 'result-1' }];
  const assets = [
    { media_id: 'report-photo', subject_type: 'report', subject_id: 'report-1' },
    { media_id: 'after-photo', subject_type: 'activity_result', subject_id: 'result-1' },
  ];

  assert.equal(selectPublicationAsset(assets, sources)?.media_id, 'after-photo');
});
