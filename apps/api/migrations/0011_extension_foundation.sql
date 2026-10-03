ALTER TABLE reports ADD COLUMN public_visibility text NOT NULL DEFAULT 'hidden'
  CHECK(public_visibility IN ('hidden','public','withdrawn'));
ALTER TABLE reports ADD COLUMN instagram_allowed boolean NOT NULL DEFAULT true;
ALTER TABLE reports ADD COLUMN public_ever boolean NOT NULL DEFAULT false;
ALTER TABLE reports ADD COLUMN last_observed_at timestamptz;
UPDATE reports SET public_visibility='public',public_ever=true
 WHERE status IN ('verified','in_progress','resolved') AND duplicate_of_id IS NULL AND public_summary IS NOT NULL;
CREATE INDEX reports_public_idx ON reports(h3_cell,occurred_at) WHERE public_visibility='public' AND duplicate_of_id IS NULL;
ALTER TABLE media DROP CONSTRAINT media_purpose_check;
ALTER TABLE media ADD CONSTRAINT media_purpose_check CHECK(purpose IN ('scan','report','resolution','avatar','community','activity_evidence'));
-- Existing originals are never silently grandfathered as reviewed derivatives.
UPDATE media SET public_derivative_key=NULL WHERE public_derivative_key=object_key;
DELETE FROM area_snapshots;
ALTER TABLE outbox_events ADD COLUMN lease_owner uuid;
ALTER TABLE outbox_events ADD COLUMN lease_expires_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN last_error_code text;
CREATE TABLE media_consents (
 media_id uuid PRIMARY KEY REFERENCES media(id),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 channels text[] NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(channels <@ ARRAY['web','instagram']::text[])
);
CREATE TABLE evidence_links (
 subject_type text NOT NULL CHECK(subject_type IN ('report','community_update','activity_result')),
 subject_id uuid NOT NULL,media_id uuid NOT NULL REFERENCES media(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(subject_type,subject_id,media_id)
);
CREATE INDEX evidence_links_media_idx ON evidence_links(media_id);
CREATE TABLE evidence_renditions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),media_id uuid NOT NULL REFERENCES media(id),
 subject_type text NOT NULL CHECK(subject_type IN ('report','community_update','activity_result')),subject_id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','ready','failed')),
 object_key text,redactions jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE media_publication_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid NOT NULL REFERENCES reports(id),
 subject_type text NOT NULL,subject_id uuid NOT NULL,media_id uuid NOT NULL REFERENCES media(id),
 rendition_id uuid NOT NULL REFERENCES evidence_renditions(id),channel text NOT NULL CHECK(channel IN ('web','instagram')),
 actor_id uuid NOT NULL REFERENCES users(id),approved boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(report_id,media_id,channel)
);
CREATE TABLE approved_resolution_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid NOT NULL REFERENCES reports(id),
 source_type text NOT NULL CHECK(source_type IN ('community_update','activity_result')),source_id uuid NOT NULL,
 source_revision integer NOT NULL,media_id uuid NOT NULL REFERENCES media(id),observed_at timestamptz NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),status text NOT NULL DEFAULT 'valid' CHECK(status IN ('valid','revoked')),
 UNIQUE(source_type,source_id,source_revision,media_id)
);
CREATE TABLE public_incident_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid NOT NULL REFERENCES reports(id),
 kind text NOT NULL CHECK(kind IN ('verified','condition_updated','handling_started','resolved','correction','activity_result')),
 summary text NOT NULL,observed_at timestamptz,evidence_media_ids uuid[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_incident_events_report_idx ON public_incident_events(report_id,created_at DESC,id DESC);
