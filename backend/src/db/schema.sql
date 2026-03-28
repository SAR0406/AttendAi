-- ============================================================
-- AttendAi – Supabase (Postgres) schema
-- Run this in your Supabase SQL editor to set up the database.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- Organizations (multi-tenant isolation)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  clerk_id    TEXT UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'free',       -- free | pro | team | enterprise
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  clerk_id    TEXT UNIQUE NOT NULL,
  email       TEXT NOT NULL,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Meetings
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meetings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id),
  title             TEXT,
  zoom_meeting_id   TEXT,
  zoom_join_url     TEXT NOT NULL,
  recall_bot_id     TEXT,
  status            TEXT NOT NULL DEFAULT 'scheduled',
  -- scheduled | joining | in_progress | processing | completed | failed
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  duration_secs     INTEGER,
  participant_count INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Transcript segments (real-time diarized output)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcript_segments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id   UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL,
  speaker      TEXT,
  text         TEXT NOT NULL,
  start_time   REAL NOT NULL,   -- seconds from meeting start
  end_time     REAL NOT NULL,
  confidence   REAL,
  is_final     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Meeting notes (AI-generated)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meeting_notes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id    UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL,
  summary       TEXT,
  action_items  JSONB NOT NULL DEFAULT '[]',
  decisions     JSONB NOT NULL DEFAULT '[]',
  key_points    JSONB NOT NULL DEFAULT '[]',
  questions     JSONB NOT NULL DEFAULT '[]',
  raw_llm_json  JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Screenshots
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS screenshots (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id   UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL,
  r2_key       TEXT NOT NULL,   -- Cloudflare R2 object key
  public_url   TEXT,
  captured_at  REAL NOT NULL,   -- seconds from meeting start
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Webhook idempotency log
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id   TEXT UNIQUE NOT NULL,
  event_type    TEXT NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Audit log
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL,
  user_id     UUID,
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  resource_id UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Row-Level Security (multi-tenant isolation)
-- ─────────────────────────────────────────────
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_notes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events         ENABLE ROW LEVEL SECURITY;

-- Service-role bypasses RLS; app only uses anon/jwt policies for client SDK
-- Frontend uses anon key + JWT; org_id is verified via Clerk JWT claim.

CREATE POLICY "org_isolation_meetings" ON meetings
  USING (org_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY "org_isolation_segments" ON transcript_segments
  USING (org_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY "org_isolation_notes" ON meeting_notes
  USING (org_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY "org_isolation_screenshots" ON screenshots
  USING (org_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY "org_isolation_audit" ON audit_events
  USING (org_id = current_setting('app.current_org_id')::UUID);

-- ─────────────────────────────────────────────
-- Indexes for common query patterns
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meetings_org      ON meetings (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_bot      ON meetings (recall_bot_id);
CREATE INDEX IF NOT EXISTS idx_segments_meeting  ON transcript_segments (meeting_id, start_time);
CREATE INDEX IF NOT EXISTS idx_notes_meeting     ON meeting_notes (meeting_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_meet  ON screenshots (meeting_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_webhook_ext_id    ON webhook_events (external_id);
CREATE INDEX IF NOT EXISTS idx_audit_org         ON audit_events (org_id, created_at DESC);

-- ─────────────────────────────────────────────
-- Updated-at trigger helper
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON meeting_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
