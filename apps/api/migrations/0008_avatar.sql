-- 0008_avatar
-- Account profile photo. Reuses the existing media pipeline (upload → re-encode →
-- signed GET) with a new purpose. A user points at one stored avatar object; the
-- FK is ON DELETE SET NULL so the deletion/cleanup job can remove the object and
-- the pointer clears itself without blocking on the constraint.

-- Widen the media purpose taxonomy to include profile photos. The inline CHECK
-- from 0002 is auto-named media_purpose_check; drop and recreate it.
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_purpose_check;
ALTER TABLE media
  ADD CONSTRAINT media_purpose_check
  CHECK (purpose IN ('scan', 'report', 'resolution', 'avatar'));

ALTER TABLE users
  ADD COLUMN avatar_media_id uuid REFERENCES media (id) ON DELETE SET NULL;
