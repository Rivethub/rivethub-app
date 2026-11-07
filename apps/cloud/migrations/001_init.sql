CREATE TABLE users (
  id          uuid PRIMARY KEY,
  email       text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL
);

CREATE TABLE sign_in_requests (
  id           text PRIMARY KEY,
  secret_hash  text NOT NULL,
  email        text NOT NULL,
  install_id   uuid NOT NULL,
  expires_at   timestamptz NOT NULL,
  verified_at  timestamptz,
  consumed_at  timestamptz
);
CREATE INDEX sign_in_requests_expires_idx ON sign_in_requests (expires_at);
CREATE INDEX sign_in_requests_email_idx ON sign_in_requests (email);

CREATE TABLE install_tokens (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  install_id  uuid NOT NULL,
  created_at  timestamptz NOT NULL
);
CREATE INDEX install_tokens_user_idx ON install_tokens (user_id);

CREATE TABLE crash_reports (
  id           bigserial PRIMARY KEY,
  received_at  timestamptz NOT NULL,
  install_id   uuid NOT NULL,
  rh           text NOT NULL,
  os           text NOT NULL,
  job          text NOT NULL,
  kind         text NOT NULL,
  location     text NOT NULL,
  frames       jsonb NOT NULL,
  occurred_at  timestamptz NOT NULL
);

CREATE TABLE usage_reports (
  install_id   uuid NOT NULL,
  day          date NOT NULL,
  received_at  timestamptz NOT NULL,
  rh           text NOT NULL,
  os           text NOT NULL,
  counts       jsonb NOT NULL,
  PRIMARY KEY (install_id, day)
);

CREATE TABLE releases (
  channel     text NOT NULL CHECK (channel IN ('stable', 'beta')),
  os          text NOT NULL,
  version     text NOT NULL,
  url         text NOT NULL,
  sha256      text NOT NULL,
  signature   text NOT NULL,
  notes_url   text NOT NULL,
  created_at  timestamptz NOT NULL,
  PRIMARY KEY (channel, os, version)
);
