INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.permission_code
FROM role_definitions r
CROSS JOIN (VALUES ('client.documents.manage_own')) AS p(permission_code)
WHERE r.code = 'client'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.permission_code
FROM role_definitions r
CROSS JOIN (VALUES ('documents.metadata.read'), ('documents.download'), ('documents.scan.manage'), ('documents.retention.manage')) AS p(permission_code)
WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;
