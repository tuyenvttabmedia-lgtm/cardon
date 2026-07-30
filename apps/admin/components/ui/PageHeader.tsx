import Link from 'next/link';
import { cn } from '@/lib/utils';

export type Breadcrumb = { label: string; href?: string };

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 text-sm text-slate-500">
            <ol className="flex flex-wrap items-center gap-1.5">
              {breadcrumbs.map((crumb, index) => (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 && (
                    <span aria-hidden className="text-slate-300">
                      /
                    </span>
                  )}
                  {crumb.href ? (
                    <Link href={crumb.href} className="hover:text-admin-700">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-800">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="admin-page-title">{title}</h1>
        {subtitle && <p className="admin-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Section-level heading inside a page (smaller than PageHeader). */
export function SectionHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
