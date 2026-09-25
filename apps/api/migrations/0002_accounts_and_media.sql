-- 0002_accounts_and_media
-- DATABASE.md section 2. Accounts, auth challenges, media objects, and the
-- fixed 10-category taxonomy. Enum CHECKs mirror the OpenAPI contract; where an
-- attribute is internal-only (media.state) the allowed set is documented here.

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized  text NOT NULL,
  -- Nullable so the deletion job can pseudonymise/clear credentials without
  -- dropping the row (activity is pseudonymised, not hard-deleted).
  password_hash     text,
  display_name      text NOT NULL,
  role              text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  email_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
-- Unique on active accounts only; deletion pseudonymises the email so a fresh
-- registration can reuse the address later.
CREATE UNIQUE INDEX users_email_normalized_active_key
  ON users (email_normalized) WHERE deleted_at IS NULL;

CREATE TABLE sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Only the SHA-256 hash of the opaque token is ever stored.
  token_hash         text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  last_seen_at       timestamptz,
  reauthenticated_at timestamptz
);
CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE auth_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users (id) ON DELETE CASCADE,
  email_hash   text NOT NULL,
  purpose      text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  -- Real OTP is never stored; only a hash. Challenge id is what the client echoes.
  code_hash    text NOT NULL,
  attempts     smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  resend_after timestamptz,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_challenges_email_purpose_idx ON auth_challenges (email_hash, purpose);
CREATE INDEX auth_challenges_expires_at_idx ON auth_challenges (expires_at);

CREATE TABLE media (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No ON DELETE cascade: R2 objects must be removed explicitly by the deletion
  -- job before the owner row is pseudonymised (DATABASE.md section 7).
  owner_id              uuid NOT NULL REFERENCES users (id),
  purpose               text NOT NULL CHECK (purpose IN ('scan', 'report', 'resolution')),
  object_key            text NOT NULL,
  mime                  text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes            bigint NOT NULL CHECK (size_bytes >= 0),
  sha256                text NOT NULL,
  width                 integer,
  height                integer,
  -- Internal lifecycle: reserved on request, stored after upload+re-encode, deleted on cleanup.
  state                 text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'stored', 'deleted')),
  public_derivative_key text,
  expires_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE UNIQUE INDEX media_object_key_key ON media (object_key);
CREATE INDEX media_owner_id_idx ON media (owner_id);
CREATE INDEX media_expires_at_idx ON media (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE categories (
  id         text PRIMARY KEY CHECK (id IN (
               'battery', 'biological', 'cardboard', 'clothes', 'glass',
               'metal', 'paper', 'plastic', 'shoes', 'trash')),
  name_id    text NOT NULL,
  sort_order integer NOT NULL,
  active     boolean NOT NULL DEFAULT true
);
