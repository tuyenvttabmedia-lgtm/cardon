'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
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
    <Dialog
      open
      onClose={() => onDismiss?.()}
      closeOnOverlayClick={false}
      title={credentials.title ?? vi.agents.credsWarning}
      description={
        credentials.hint ??
        'Secret không hiển thị lại sau khi đóng. Khóa cũ (nếu có) đã ngừng hoạt động khi tạo lại.'
      }
      panelClassName="border-amber-300 bg-amber-50"
      footer={
        <>
          <CopyButton value={both} label="Copy cả hai" />
          {onDismiss && (
            <Button size="sm" onClick={onDismiss}>
              {vi.agents.credsSaved}
            </Button>
          )}
        </>
      }
    >
      <dl className="space-y-3 text-sm">
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
    </Dialog>
  );
}
