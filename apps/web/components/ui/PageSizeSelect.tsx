'use client';

const DEFAULT_OPTIONS = [10, 50, 100] as const;

export function PageSizeSelect({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  label = 'Hiển thị',
}: {
  value: number;
  onChange: (next: number) => void;
  options?: readonly number[];
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-cardon-gray">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-cardon-border bg-white px-2 py-1.5 text-sm text-cardon-navy"
      >
        {options.map((size) => (
          <option key={size} value={size}>
            {size}/trang
          </option>
        ))}
      </select>
    </label>
  );
}
