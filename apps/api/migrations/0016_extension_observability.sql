-- Persist validated provider usage separately from the model recommendation.
ALTER TABLE review_runs
  ADD COLUMN usage_input_tokens integer,
  ADD COLUMN usage_output_tokens integer,
  ADD COLUMN usage_cost_usd numeric(12,6),
  ADD CONSTRAINT review_runs_usage_consistency CHECK (
    (usage_input_tokens IS NULL AND usage_output_tokens IS NULL AND usage_cost_usd IS NULL)
    OR
    (usage_input_tokens IS NOT NULL AND usage_input_tokens > 0
      AND usage_output_tokens IS NOT NULL AND usage_output_tokens > 0
      AND usage_cost_usd IS NOT NULL AND usage_cost_usd >= 0)
  );
