-- Published migrations are immutable. This extension is applied only as a complete R1 bundle.
ALTER TABLE users ADD COLUMN impact_identity uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE activity_memberships ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE activity_memberships ADD COLUMN statistics_key uuid;
UPDATE activity_memberships m SET statistics_key=u.impact_identity FROM users u WHERE u.id=m.user_id;
ALTER TABLE activity_memberships ALTER COLUMN statistics_key SET NOT NULL;
CREATE FUNCTION set_membership_statistics_key() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.user_id IS NOT NULL THEN
  SELECT impact_identity INTO NEW.statistics_key FROM users WHERE id=NEW.user_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER activity_membership_statistics_key BEFORE INSERT OR UPDATE OF user_id ON activity_memberships
 FOR EACH ROW EXECUTE FUNCTION set_membership_statistics_key();

ALTER TABLE reports ADD COLUMN public_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE reports ADD COLUMN public_code text GENERATED ALWAYS AS
 ('SAP-' || CASE WHEN public_number<1000 THEN lpad(public_number::text,3,'0') ELSE public_number::text END) STORED UNIQUE;

ALTER TABLE instagram_posts ADD COLUMN rendition_metadata jsonb;
ALTER TABLE instagram_posts ALTER COLUMN template_version SET DEFAULT 'sap-feed-reference-v2';
CREATE TABLE publication_map_snapshots (
 cell_id text NOT NULL,style_version text NOT NULL,source_sha256 text NOT NULL,
 data_json jsonb NOT NULL,generated_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 PRIMARY KEY(cell_id,style_version)
);
CREATE TABLE publication_map_budgets (
 budget_date date PRIMARY KEY,request_count integer NOT NULL DEFAULT 0 CHECK(request_count>=0)
);
CREATE TABLE media_cleanup_tasks (
 object_key text PRIMARY KEY,media_id uuid REFERENCES media(id),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
);
ALTER TABLE deletion_requests ADD COLUMN extension_prepared_at timestamptz;
CREATE INDEX outbox_lease_recovery_idx ON outbox_events(state,lease_expires_at,next_attempt_at);
