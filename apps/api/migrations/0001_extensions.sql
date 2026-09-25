-- 0001_extensions
-- Baseline extensions. PostGIS is required for reports.location geography(Point,4326)
-- and the GiST index used by ST_DWithin duplicate-suggestion queries.
-- gen_random_uuid() is provided by Postgres core (>= 13); no pgcrypto needed.

CREATE EXTENSION IF NOT EXISTS postgis;
