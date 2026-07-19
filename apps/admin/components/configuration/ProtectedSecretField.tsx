'use client';

import { useState } from 'react';
import { Input, Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { useAuth } from '@/hooks/useAuth';

export function ProtectedSecretField({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
}) {
  const { user } = useAuth();
  const [revealed, setRevealed] = useState(false);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const masked = value.includes('*') || !value;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700">{label}</label>
      <div className="flex gap-2">
        <Input
          type={revealed && isSuperAdmin && !masked ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '••••••••••••'}
          className="font-mono text-sm"
        />
        {isSuperAdmin && masked && (
          <Button type="button" variant="secondary" onClick={() => setRevealed((r) => !r)}>
            {revealed ? vi.configuration.hide : vi.configuration.reveal}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => void navigator.clipboard.writeText(value)}
          disabled={!value}
        >
          {vi.configuration.copy}
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
