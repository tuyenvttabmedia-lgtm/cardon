'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConfigurationSearchDialog } from '@/components/configuration/ConfigurationSearchDialog';
import { ConfigurationSubNav } from '@/components/configuration/ConfigurationSubNav';
import { configurationSectionFromPath } from '@/lib/configuration-routes';
import { vi } from '@/lib/i18n/vi';

function ConfigurationBreadcrumb({ sectionLabel }: { sectionLabel?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/configuration" className="hover:text-admin-700">
            {vi.configuration.title}
          </Link>
        </li>
        {sectionLabel && (
          <>
            <li aria-hidden className="text-zinc-300">/</li>
            <li className="font-medium text-zinc-800">{sectionLabel}</li>
          </>
        )}
      </ol>
    </nav>
  );
}

export function ConfigurationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = configurationSectionFromPath(pathname);
  const isOverview = pathname === '/configuration';
  const isAudit = pathname === '/configuration/audit';

  return (
    <>
      <ConfigurationSearchDialog />
      <div className="space-y-4">
        <ConfigurationBreadcrumb sectionLabel={isOverview ? undefined : section?.label} />

        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
            {section?.title ?? vi.configuration.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {section?.subtitle ?? vi.configuration.principleHint}
          </p>
          {isAudit && (
            <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {vi.configuration.auditPrinciple}
            </p>
          )}
          {!isOverview && (
            <p className="mt-2 text-xs text-zinc-400">
              {vi.configuration.searchHint}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <ConfigurationSubNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </>
  );
}
