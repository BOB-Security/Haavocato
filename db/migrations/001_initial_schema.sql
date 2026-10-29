-- Haavocato replacement schema — PostgreSQL
-- Apply only to a NEW/staging database during development. Never run against production
-- until a reviewed migration and verified backup/restore procedure exist.

BEGIN;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','ar')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','closed')),
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_lower_uq ON app_users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS app_users_phone_uq ON app_users (phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS role_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  display_name_en TEXT NOT NULL,
  display_name_ar TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES role_definitions(id) ON DELETE RESTRICT,
  granted_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES role_definitions(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS client_profiles (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  organization_name TEXT,
  preferred_contact_method TEXT CHECK (preferred_contact_method IN ('email','phone','whatsapp')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  title_en TEXT,
  title_ar TEXT,
  bio_en TEXT,
  bio_ar TEXT,
  is_lawyer BOOLEAN NOT NULL DEFAULT FALSE,
  is_public_profile BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS legal_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  summary_en TEXT NOT NULL DEFAULT '',
  summary_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  delivery_type TEXT NOT NULL DEFAULT 'consultation'
    CHECK (delivery_type IN ('consultation','document_review','document_drafting','translation','company_formation','litigation','course','other')),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  intake_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS legal_services_published_order_idx ON legal_services(is_published, display_order);

CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code TEXT NOT NULL UNIQUE,
  client_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  service_id UUID REFERENCES legal_services(id) ON DELETE SET NULL,
  service_name_snapshot TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  requester_phone TEXT NOT NULL,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','ar')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','triage','awaiting_client','assigned','in_progress','awaiting_payment','scheduled','completed','declined','cancelled','archived')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to UUID REFERENCES app_users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  legacy_source TEXT,
  legacy_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS service_requests_legacy_source_id_uq
  ON service_requests(legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_requests_status_submitted_idx ON service_requests(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_client_submitted_idx ON service_requests(client_user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_assigned_status_idx ON service_requests(assigned_to, status);

CREATE TABLE IF NOT EXISTS request_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  public_message TEXT,
  internal_note TEXT,
  changed_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS request_status_events_request_time_idx ON request_status_events(request_id, created_at);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
  client_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_lawyer_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  consultation_mode TEXT NOT NULL CHECK (consultation_mode IN ('video','phone','in_person')),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','confirmed','rescheduled','completed','cancelled','no_show')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
  location_or_meeting_reference TEXT,
  client_note TEXT,
  internal_note TEXT,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS appointments_start_status_idx ON appointments(starts_at, status);
CREATE INDEX IF NOT EXISTS appointments_lawyer_start_idx ON appointments(assigned_lawyer_id, starts_at);

CREATE TABLE IF NOT EXISTS availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_local TIME NOT NULL,
  ends_local TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
  valid_from DATE,
  valid_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (ends_local > starts_local),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);
CREATE TABLE IF NOT EXISTS availability_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('unavailable','extra_availability')),
  reason TEXT,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS private_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE,
  client_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  storage_provider TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  checksum_sha256 TEXT,
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','quarantined','failed','not_scanned')),
  visibility TEXT NOT NULL DEFAULT 'request_team' CHECK (visibility IN ('client_and_team','request_team','restricted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS private_documents_request_created_idx ON private_documents(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE RESTRICT,
  client_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK (method IN ('vodafone_cash','instapay','bank_transfer','card','other')),
  amount NUMERIC(12,2),
  currency CHAR(3) NOT NULL DEFAULT 'EGP',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','under_review','confirmed','rejected','refunded','cancelled')),
  provider_reference TEXT,
  proof_document_id UUID REFERENCES private_documents(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  client_note TEXT,
  internal_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount IS NULL OR amount >= 0)
);
CREATE INDEX IF NOT EXISTS payment_records_request_created_idx ON payment_records(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_records_status_created_idx ON payment_records(status, created_at DESC);

CREATE TABLE IF NOT EXISTS site_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  body_en TEXT NOT NULL DEFAULT '',
  body_ar TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS legal_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  excerpt_en TEXT NOT NULL DEFAULT '',
  excerpt_ar TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  body_ar TEXT NOT NULL DEFAULT '',
  category TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  author_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS legal_insights_status_published_idx ON legal_insights(status, published_at DESC);

CREATE TABLE IF NOT EXISTS partner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  title_en TEXT NOT NULL DEFAULT '',
  title_ar TEXT NOT NULL DEFAULT '',
  bio_en TEXT NOT NULL DEFAULT '',
  bio_ar TEXT NOT NULL DEFAULT '',
  photo_storage_key TEXT,
  external_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp','in_app')),
  template_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','cancelled')),
  related_request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
  provider_message_id TEXT,
  failure_code TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notification_events_status_created_idx ON notification_events(status, created_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action_code TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied','failure')),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx ON audit_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_sessions_user_expiry_idx ON app_sessions(user_id, expires_at);

COMMIT;
