ALTER TABLE activities
  ADD COLUMN public_cancel_reason text,
  ADD CONSTRAINT activities_public_cancel_reason_check CHECK (
    public_cancel_reason IS NULL OR (
      status='cancelled'
      AND char_length(btrim(public_cancel_reason)) BETWEEN 5 AND 1000
    )
  );
