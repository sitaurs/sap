-- 0010_totp_mfa
-- Optional TOTP MFA state. Secrets are AES-256-GCM ciphertext only; recovery
-- codes are keyed hashes only. Login pre-auth tokens are never stored raw.

CREATE TABLE mfa_factors (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('pending', 'active')),
  secret_ciphertext text NOT NULL,
  secret_iv text NOT NULL,
  secret_tag text NOT NULL,
  last_accepted_step bigint,
  pending_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'pending' AND pending_expires_at IS NOT NULL) OR
         (state = 'active' AND pending_expires_at IS NULL))
);

CREATE TABLE mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  UNIQUE (user_id, code_hash)
);
CREATE INDEX mfa_recovery_codes_user_idx ON mfa_recovery_codes (user_id) WHERE consumed_at IS NULL;

CREATE TABLE mfa_preauth_challenges (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_preauth_expiry_idx ON mfa_preauth_challenges (expires_at);

-- Account-wide rate limit survives issuing fresh pre-auth tokens. Old windows can
-- be pruned by a future maintenance job; one row per account is retained.
CREATE TABLE mfa_login_limits (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  attempts smallint NOT NULL CHECK (attempts >= 0),
  locked_until timestamptz
);
