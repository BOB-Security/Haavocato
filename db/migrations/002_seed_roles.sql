-- Role catalogue for the replacement platform.
-- Applying this migration creates role definitions and permission mappings only;
-- it does not create or grant access to any user account.

INSERT INTO role_definitions (code, display_name_en, display_name_ar) VALUES
  ('super_admin', 'Super administrator', 'مدير النظام الأعلى'),
  ('operations_admin', 'Operations administrator', 'مدير العمليات'),
  ('intake_staff', 'Client intake staff', 'موظف استقبال الطلبات'),
  ('lawyer', 'Lawyer', 'محامٍ'),
  ('finance_staff', 'Finance staff', 'المسؤول المالي'),
  ('content_editor', 'Content editor', 'محرر المحتوى'),
  ('client', 'Client', 'عميل')
ON CONFLICT (code) DO UPDATE SET
  display_name_en = EXCLUDED.display_name_en,
  display_name_ar = EXCLUDED.display_name_ar;

-- The super_admin role is intentionally comprehensive. Assign it only through a reviewed,
-- audited bootstrap procedure after verifying the operator's identity.
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.permission_code
FROM role_definitions r
CROSS JOIN (VALUES
  ('requests.read'),
  ('requests.create'),
  ('requests.status.update'),
  ('requests.assign'),
  ('clients.read'),
  ('clients.update'),
  ('appointments.read'),
  ('appointments.manage'),
  ('availability.manage'),
  ('documents.metadata.read'),
  ('documents.download'),
  ('documents.retention.manage'),
  ('payments.read'),
  ('payments.review'),
  ('payments.refund'),
  ('services.manage'),
  ('cms.manage'),
  ('partners.manage'),
  ('notifications.manage'),
  ('users.read'),
  ('users.manage'),
  ('roles.manage'),
  ('audit.read'),
  ('reports.export'),
  ('settings.manage')
) AS p(permission_code)
WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.permission_code
FROM role_definitions r
CROSS JOIN (VALUES
  ('requests.read'), ('requests.create'), ('requests.status.update'),
  ('requests.assign'), ('clients.read'), ('clients.update'),
  ('appointments.read'), ('appointments.manage'), ('availability.manage'),
  ('services.manage'), ('partners.manage'), ('notifications.manage'),
  ('users.read'), ('reports.export')
) AS p(permission_code)
WHERE r.code = 'operations_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.permission_code
FROM role_definitions r
CROSS JOIN (VALUES
  ('requests.read'), ('requests.create'), ('requests.status.update'),
  ('clients.read'), ('appointments.read')
) AS p(permission_code)
WHERE r.code = 'intake_staff'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.permission_code
FROM role_definitions r
CROSS JOIN (VALUES
  ('requests.read'), ('requests.status.update'), ('appointments.read'),
  ('documents.metadata.read'), ('documents.download')
) AS p(permission_code)
WHERE r.code = 'lawyer'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.permission_code
FROM role_definitions r
CROSS JOIN (VALUES
  ('requests.read'), ('payments.read'), ('payments.review'), ('payments.refund'),
  ('reports.export')
) AS p(permission_code)
WHERE r.code = 'finance_staff'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.permission_code
FROM role_definitions r
CROSS JOIN (VALUES
  ('services.manage'), ('cms.manage'), ('partners.manage')
) AS p(permission_code)
WHERE r.code = 'content_editor'
ON CONFLICT DO NOTHING;

-- Client access is resource-scoped and must be enforced in the API query itself.
-- These permissions alone never authorize access to another client's records.
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.permission_code
FROM role_definitions r
CROSS JOIN (VALUES
  ('client.profile.read_own'), ('client.profile.update_own'),
  ('client.requests.read_own'), ('client.requests.create_own'),
  ('client.documents.manage_own'), ('client.appointments.manage_own'),
  ('client.payments.read_own')
) AS p(permission_code)
WHERE r.code = 'client'
ON CONFLICT DO NOTHING;

