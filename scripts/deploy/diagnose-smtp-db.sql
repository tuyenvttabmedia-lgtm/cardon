SELECT key, 
  value->>'host' AS host,
  value->>'username' AS username,
  CASE WHEN value->>'passwordEnc' IS NOT NULL AND length(value->>'passwordEnc') > 0 THEN 'SET(len=' || length(value->>'passwordEnc')::text || ')' ELSE 'MISSING' END AS password_enc,
  value->>'from' AS from_addr,
  updated_at
FROM system_settings WHERE key = 'settings.smtp';
