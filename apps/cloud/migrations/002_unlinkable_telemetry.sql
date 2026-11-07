CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE sign_in_requests DROP COLUMN IF EXISTS install_id;
ALTER TABLE install_tokens DROP COLUMN IF EXISTS install_id;

DO $$
DECLARE
  salt text := coalesce(current_setting('rivethub.telemetry_salt', true), '');
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'crash_reports' AND column_name = 'install_id'
  ) THEN
    IF salt = '' AND (EXISTS (SELECT 1 FROM crash_reports) OR EXISTS (SELECT 1 FROM usage_reports)) THEN
      RAISE EXCEPTION 'TELEMETRY_SALT is required to migrate existing telemetry rows';
    END IF;

    ALTER TABLE crash_reports ADD COLUMN IF NOT EXISTS install_hash text;
    UPDATE crash_reports
      SET install_hash = encode(hmac(lower(install_id::text), salt, 'sha256'), 'hex')
      WHERE install_hash IS NULL;
    ALTER TABLE crash_reports ALTER COLUMN install_hash SET NOT NULL;
    ALTER TABLE crash_reports DROP COLUMN install_id;

    ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS install_hash text;
    UPDATE usage_reports
      SET install_hash = encode(hmac(lower(install_id::text), salt, 'sha256'), 'hex')
      WHERE install_hash IS NULL;
    ALTER TABLE usage_reports ALTER COLUMN install_hash SET NOT NULL;
    ALTER TABLE usage_reports DROP COLUMN install_id;
    ALTER TABLE usage_reports ADD PRIMARY KEY (install_hash, day);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crash_reports_received_idx ON crash_reports (received_at);
CREATE INDEX IF NOT EXISTS usage_reports_received_idx ON usage_reports (received_at);
