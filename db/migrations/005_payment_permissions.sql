-- Least-privilege payment actions for client and finance roles.
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.permission_code
FROM role_definitions r
CROSS JOIN (VALUES ('client.payments.submit_own')) AS p(permission_code)
WHERE r.code = 'client'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.permission_code
FROM role_definitions r
CROSS JOIN (VALUES ('payments.read'), ('payments.review'), ('payments.refund')) AS p(permission_code)
WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;
