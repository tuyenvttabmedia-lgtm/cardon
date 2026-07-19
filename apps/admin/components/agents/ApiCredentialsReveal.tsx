'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? 'Đã copy' : label ?? 'Copy'}
    </Button>
  );
}

export type ApiCredentialsPayload = {
  apiKey: string;
  secretKey: string;
  title?: string;
  hint?: string;
};

export function ApiCredentialsReveal({
  credentials,
  onDismiss,
}: {
  credentials: ApiCredentialsPayload;
  onDismiss?: () => void;
}) {
  const both = `API Key: ${credentials.apiKey}\nSecret: ${credentials.secretKey}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-amber-950">
          {credentials.title ?? vi.agents.credsWarning}
        </h3>
        <p className="mt-2 text-sm text-amber-900">
          {credentials.hint ??
            'Secret không hiển thị lại sau khi đóng. Khóa cũ (nếu có) đã ngừng hoạt động khi tạo lại.'}
        </p>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-amber-800">API Key</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 font-mono text-amber-950 break-all">
              {credentials.apiKey}
              <CopyButton value={credentials.apiKey} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-amber-800">Secret Key</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 font-mono text-amber-950 break-all">
              {credentials.secretKey}
              <CopyButton value={credentials.secretKey} />
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <CopyButton value={both} label="Copy cả hai" />
          {onDismiss && (
            <Button size="sm" onClick={onDismiss}>
              {vi.agents.credsSaved}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
