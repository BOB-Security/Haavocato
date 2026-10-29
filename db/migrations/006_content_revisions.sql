CREATE TABLE IF NOT EXISTS content_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('page','insight','partner','service')),
  entity_id TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  saved_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS content_revisions_entity_created_idx
  ON content_revisions(entity_type, entity_id, created_at DESC);
