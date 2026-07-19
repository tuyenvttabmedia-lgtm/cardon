INSERT INTO users (id, email, password_hash, role, status, full_name, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'system@cardon.local',
  '$2b$10$placeholderhashnotusedforloginxxxxxxxxxxxxxxxxxxxxxxxxx',
  'ADMIN',
  'ACTIVE',
  'System Provider Audit',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE email = 'system@cardon.local'
);

SELECT id, email, role, status FROM users WHERE email = 'system@cardon.local';
