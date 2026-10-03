CREATE TABLE instagram_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
 status text NOT NULL DEFAULT 'disconnected' CHECK(status IN ('connected','disconnected','expired','needs_action')),
 username text,ig_user_id text,page_id text,encrypted_credentials text,
 scopes text[] NOT NULL DEFAULT '{}',token_expires_at timestamptz,permissions_checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO instagram_accounts(singleton) VALUES(true);
CREATE TABLE instagram_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),revision integer NOT NULL DEFAULT 1,
 payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO instagram_settings(payload) VALUES('{"source":"reports","onlyVerified":true,"format":"feed","timezone":"Asia/Jakarta","draftGeneration":"automatic","publishMode":"approval_required","captionTemplate":"{summary}\nPantau perkembangan di SAP: {url}","hashtags":"#SAP #Lingkungan"}');
CREATE TABLE instagram_publication_series (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid NOT NULL REFERENCES reports(id),account_id uuid NOT NULL REFERENCES instagram_accounts(id),
 kind text NOT NULL CHECK(kind IN ('initial','resolution')),milestone_key text NOT NULL DEFAULT 'initial',
 generation integer NOT NULL DEFAULT 0 CHECK(generation>=0),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(report_id,account_id,kind,milestone_key)
);
CREATE TABLE instagram_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),series_id uuid NOT NULL REFERENCES instagram_publication_series(id),
 report_id uuid NOT NULL REFERENCES reports(id),account_id uuid NOT NULL REFERENCES instagram_accounts(id),
 kind text NOT NULL CHECK(kind IN ('initial','resolution')),milestone_id uuid,generation integer NOT NULL CHECK(generation>0),
 replaces_post_id uuid REFERENCES instagram_posts(id),revision integer NOT NULL DEFAULT 1,content_revision integer NOT NULL DEFAULT 1,
 source_revision integer NOT NULL,source_snapshot jsonb NOT NULL,media_id uuid NOT NULL REFERENCES media(id),
 evidence_rendition_id uuid NOT NULL REFERENCES evidence_renditions(id),caption text NOT NULL,alt_text text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','publishing','published','failed','cancelled','retracting','retracted','needs_action')),
 rendition_id uuid NOT NULL DEFAULT gen_random_uuid(),rendition_revision integer NOT NULL DEFAULT 1,
 rendition_status text NOT NULL DEFAULT 'queued' CHECK(rendition_status IN ('queued','ready','failed')),
 rendition_object_key text,template_version text NOT NULL DEFAULT 'sap-feed-v1',
 approval jsonb NOT NULL DEFAULT '{"status":"unapproved","contentRevision":null,"sourceRevision":null,"renditionId":null,"approvedAt":null}',
 provider_container_id text,provider_media_id text,publish_error text,last_operation_id uuid,
 published_at timestamptz,retracted_at timestamptz,permalink text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(series_id,generation)
);
CREATE UNIQUE INDEX instagram_posts_active_generation ON instagram_posts(series_id)
 WHERE status IN ('draft','publishing','published','failed','retracting','needs_action');
CREATE INDEX instagram_posts_report_idx ON instagram_posts(report_id,created_at DESC,id DESC);
CREATE INDEX instagram_posts_page_idx ON instagram_posts(created_at DESC,id DESC);
CREATE TABLE instagram_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),post_id uuid REFERENCES instagram_posts(id),account_id uuid NOT NULL REFERENCES instagram_accounts(id),
 kind text NOT NULL CHECK(kind IN ('publish','retract','disconnect')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','needs_action','cancelled')),
 channels jsonb NOT NULL DEFAULT '{"sap":"unaffected","instagram":"pending"}',
 stage text NOT NULL DEFAULT 'queued',attempt_count integer NOT NULL DEFAULT 0,
 error_code text,message text NOT NULL DEFAULT 'Menunggu proses.',next_retry_at timestamptz,
 lease_owner uuid,lease_expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE instagram_posts ADD CONSTRAINT instagram_posts_last_operation_fk FOREIGN KEY(last_operation_id) REFERENCES instagram_operations(id);
CREATE UNIQUE INDEX instagram_operations_active_kind ON instagram_operations(post_id,kind) WHERE status IN ('queued','running');
CREATE INDEX instagram_operations_recovery_idx ON instagram_operations(status,next_retry_at,lease_expires_at);
CREATE TABLE instagram_publication_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid NOT NULL REFERENCES instagram_operations(id),
 stage text NOT NULL,outcome text NOT NULL CHECK(outcome IN ('started','confirmed','failed','uncertain')),
 error_code text,request_fingerprint text,attempt_number integer,provider_media_id text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX instagram_confirmed_response_idx ON instagram_publication_attempts(operation_id,stage,provider_media_id) WHERE provider_media_id IS NOT NULL;
CREATE TABLE instagram_oauth_states (
 state_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),session_id uuid NOT NULL REFERENCES sessions(id),
 expires_at timestamptz NOT NULL,consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instagram_oauth_expiry_idx ON instagram_oauth_states(expires_at);
CREATE TABLE instagram_manual_confirmations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid NOT NULL UNIQUE REFERENCES instagram_operations(id),
 actor_id uuid NOT NULL REFERENCES users(id),evidence_media_ids uuid[] NOT NULL,explanation text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

-- Every rendered revision remains discoverable for retention and account deletion.
CREATE TABLE instagram_rendition_objects (
 post_id uuid NOT NULL REFERENCES instagram_posts(id),content_revision integer NOT NULL CHECK(content_revision>0),
 object_key text PRIMARY KEY,map_metadata jsonb,map_data jsonb,
 reservation_expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instagram_rendition_objects_post_idx ON instagram_rendition_objects(post_id,content_revision);
CREATE INDEX instagram_rendition_objects_reservation_idx ON instagram_rendition_objects(reservation_expires_at);
