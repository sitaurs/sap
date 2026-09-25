-- 0006_sapa_preferences
-- SAPA_ASSISTANT.md (addendum v1.1) section 10. Per-account preference for the
-- optional SAPA virtual assistant. Default TRUE: the pet icon is visible after
-- login, but the chat panel never opens on its own. This is the ONLY persisted
-- SAPA state; conversation transcripts live only in Redis, never in Postgres.

ALTER TABLE users
  ADD COLUMN sapa_enabled boolean NOT NULL DEFAULT true;
