-- 0007_scan_settings
-- HYBRID_SCAN_DETECTION.md section 4.2. Runtime-tunable hybrid detection
-- settings, held in a single "singleton" row so the worker and admin API share
-- one source of truth. The env vars (SCAN_*) only seed this row on an empty
-- database; once present, the row is authoritative and admin-editable at runtime.

CREATE TABLE scan_settings (
  id                   text PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  mode                 text NOT NULL DEFAULT 'unknown_plus_threshold'
                         CHECK (mode IN ('full_ml', 'unknown_only', 'unknown_plus_threshold', 'full_llm')),
  confidence_threshold numeric(4,3) NOT NULL DEFAULT 0.600
                         CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1),
  vision_enabled       boolean NOT NULL DEFAULT false,
  vision_model         text NOT NULL DEFAULT 'sapa' CHECK (length(vision_model) BETWEEN 1 AND 100),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES users (id) ON DELETE SET NULL
);
