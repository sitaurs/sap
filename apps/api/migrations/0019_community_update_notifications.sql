ALTER TABLE notifications
  DROP CONSTRAINT notifications_type_check,
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'incident_updated','incident_resolved','incident_withdrawn','evidence_requested',
    'membership_decided','coordinator_assigned','activity_changed','activity_cancelled',
    'result_approved','community_update_decided'
  ));
