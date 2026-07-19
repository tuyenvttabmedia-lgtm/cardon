import { Badge } from '@/components/ui/Display';
import { vi } from '@/lib/i18n/vi';
import { isSettingsDeveloperMode } from '@/lib/settings-developer-mode';

export function SettingsRuntimeBadges({
  source,
  secretsProtected = true,
  configured,
}: {
  source?: 'database' | 'environment';
  secretsProtected?: boolean;
  configured?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {secretsProtected && (
        <Badge tone={configured === false ? 'warning' : 'success'}>
          {vi.settings.secretsProtected}
        </Badge>
      )}
      <Badge tone="default">{vi.settings.runtimeConfiguration}</Badge>
      {isSettingsDeveloperMode() && source && (
        <span className="text-xs text-zinc-400">
          {source === 'database' ? vi.app.sourceDatabase : vi.app.sourceEnvironment}
        </span>
      )}
    </div>
  );
}
