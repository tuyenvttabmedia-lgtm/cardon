SELECT value->>'topupApiUrl' AS topup_api, value->>'cardApiUrl' AS card_api, value->>'environment' AS env
FROM system_settings WHERE key = 'settings.provider.esale';
