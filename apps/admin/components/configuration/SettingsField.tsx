import { Label } from '@/components/ui/Form';
import { InfoTooltip } from '@/components/configuration/InfoTooltip';

export function SettingsField({
  label,
  tooltip,
  hint,
  children,
}: {
  label: string;
  tooltip?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center">
        <Label>{label}</Label>
        {tooltip ? <InfoTooltip text={tooltip} /> : null}
      </div>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{hint}</p> : null}
    </div>
  );
}
