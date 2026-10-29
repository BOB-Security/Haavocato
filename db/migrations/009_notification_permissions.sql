INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'notifications.manage'
FROM role_definitions r
WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;
