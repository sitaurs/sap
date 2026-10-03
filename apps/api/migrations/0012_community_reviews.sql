CREATE TABLE incident_supports (
 report_id uuid NOT NULL REFERENCES reports(id),user_id uuid NOT NULL REFERENCES users(id),
 supported boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(report_id,user_id)
);
CREATE INDEX incident_supports_active_idx ON incident_supports(report_id) WHERE supported;
CREATE TABLE incident_follows (
 report_id uuid NOT NULL REFERENCES reports(id),user_id uuid NOT NULL REFERENCES users(id),
 following boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(report_id,user_id)
);
CREATE INDEX incident_follows_user_idx ON incident_follows(user_id,created_at DESC,report_id DESC) WHERE following;
CREATE TABLE community_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid NOT NULL REFERENCES reports(id),author_id uuid NOT NULL REFERENCES users(id),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 kind text NOT NULL CHECK(kind IN ('still_present','reduced','looks_clean','information_wrong')),
 observed_at timestamptz NOT NULL,description text NOT NULL,
 correction_field text CHECK(correction_field IN ('location','category','time','photo','other')),
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','needs_evidence','approved','rejected')),
 public_summary text,requested_evidence jsonb NOT NULL DEFAULT '[]',decision_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='information_wrong')=(correction_field IS NOT NULL))
);
CREATE UNIQUE INDEX community_updates_pending_idx ON community_updates(author_id,report_id,kind)
 WHERE status IN ('submitted','needs_evidence');
CREATE INDEX community_updates_author_idx ON community_updates(author_id,created_at DESC,id DESC);
CREATE INDEX community_updates_queue_idx ON community_updates(created_at DESC,id DESC) WHERE status IN ('submitted','needs_evidence');
CREATE TABLE review_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),intent_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 subject_type text NOT NULL CHECK(subject_type IN ('report','community_update','activity_result')),
 subject_id uuid NOT NULL,subject_revision integer NOT NULL CHECK(subject_revision>0),
 report_id uuid NOT NULL REFERENCES reports(id),source_report_revision integer NOT NULL CHECK(source_report_revision>0),
 snapshot_hash text NOT NULL CHECK(length(snapshot_hash)=64),snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','superseded')),
 result jsonb,error_code text,model_version text NOT NULL,policy_version text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,finished_at timestamptz,lease_expires_at timestamptz,
 attempts integer NOT NULL DEFAULT 0,cost_reserved_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK(cost_reserved_usd>=0),
 CHECK(status<>'completed' OR (result IS NOT NULL AND error_code IS NULL AND finished_at IS NOT NULL)),
 CHECK(status<>'failed' OR (result IS NULL AND error_code IS NOT NULL AND finished_at IS NOT NULL))
);
CREATE INDEX review_runs_subject_idx ON review_runs(subject_type,subject_id,created_at DESC,id DESC);
CREATE INDEX review_runs_recovery_idx ON review_runs(status,lease_expires_at) WHERE status IN ('queued','running');
CREATE TABLE review_daily_budgets (
 budget_date date PRIMARY KEY,reserved_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK(reserved_usd>=0)
);
