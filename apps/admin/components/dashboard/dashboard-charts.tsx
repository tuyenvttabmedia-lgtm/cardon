'use client';

import { cn } from '@/lib/utils';
import type { DashboardBreakdownItem, DashboardSeriesPoint } from '@/types/api';

const DONUT_COLORS = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#64748b', '#db2777'];

export function formatComparePercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const prefix = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${prefix}${abs}%`;
}

export function CompareBadge({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  const tone =
    value == null
      ? 'text-slate-400'
      : value > 0
        ? 'text-emerald-600'
        : value < 0
          ? 'text-rose-600'
          : 'text-slate-500';
  const mark = value == null ? '' : value > 0 ? '▲ ' : value < 0 ? '▼ ' : '● ';
  return (
    <span className={cn('text-xs font-medium tabular-nums', tone, className)}>
      {mark}
      {formatComparePercent(value)}
    </span>
  );
}

/** Compact SVG sparkline for KPI cards. */
export function Sparkline({
  values,
  className,
  stroke = '#0f766e',
}: {
  values: number[];
  className?: string;
  stroke?: string;
}) {
  if (values.length < 2) {
    return <div className={cn('h-8 w-full', className)} aria-hidden />;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const w = 120;
  const h = 32;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn('h-8 w-full', className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

/** Multi-series line chart (revenue + profit) over daily points. */
export function RevenueLineChart({
  series,
  className,
}: {
  series: DashboardSeriesPoint[];
  className?: string;
}) {
  const revenues = series.map((p) => Number(p.revenue) || 0);
  const profits = series.map((p) => Number(p.profit) || 0);
  const max = Math.max(1, ...revenues, ...profits);
  const w = 640;
  const h = 220;
  const padX = 12;
  const padY = 16;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  function pathFor(values: number[]) {
    if (values.length === 0) return '';
    return values
      .map((v, i) => {
        const x =
          values.length === 1
            ? padX + innerW / 2
            : padX + (i / (values.length - 1)) * innerW;
        const y = padY + innerH - (v / max) * innerH;
        return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
      })
      .join(' ');
  }

  const hasData = revenues.some((v) => v > 0) || profits.some((v) => v > 0);

  return (
    <div className={cn('relative', className)}>
      {!hasData ? null : (
        <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full" role="img">
          {[0.25, 0.5, 0.75, 1].map((t) => {
            const y = padY + innerH - t * innerH;
            return (
              <line
                key={t}
                x1={padX}
                x2={w - padX}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            );
          })}
          <path
            d={pathFor(revenues)}
            fill="none"
            stroke="#0f766e"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={pathFor(profits)}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
      {series.length > 0 ? (
        <div className="mt-1 flex justify-between px-1 text-[10px] text-slate-400">
          <span>{series[0]?.date?.slice(5)}</span>
          <span>{series[series.length - 1]?.date?.slice(5)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function BreakdownDonut({
  items,
  className,
}: {
  items: DashboardBreakdownItem[];
  className?: string;
}) {
  const size = 160;
  const stroke = 28;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segments = items.filter((i) => i.sharePercent > 0);

  return (
    <div className={cn('flex flex-col items-center gap-3 sm:flex-row sm:items-start', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        {segments.map((item, idx) => {
          const len = (item.sharePercent / 100) * c;
          const dash = `${len} ${c - len}`;
          const el = (
            <circle
              key={item.service}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={DONUT_COLORS[idx % DONUT_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {items.map((item, idx) => (
          <li key={item.service} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: DONUT_COLORS[idx % DONUT_COLORS.length] }}
              />
              <span className="truncate text-slate-700">{item.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-500">{item.sharePercent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function seriesToSparkValues(series: DashboardSeriesPoint[]): number[] {
  return series.map((p) => Number(p.revenue) || 0);
}
