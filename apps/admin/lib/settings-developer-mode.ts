export function isSettingsDeveloperMode(): boolean {
  return process.env.NEXT_PUBLIC_SETTINGS_DEVELOPER_MODE === 'true';
}
