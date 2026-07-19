'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { adminApi, agentCenterApi, ApiClientError } from '@/services/api-client';

export default function AgentsRegistrationInvitePage() {
  const [mode, setMode] = useState<string>('—');
  const [email, setEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void agentCenterApi
      .getRegistrationMode()
      .then((r) => setMode(r.mode))
      .catch(() => setMode('—'));
  }, []);

  async function createInvite() {
    setLoading(true);
    setError(null);
    setInviteUrl(null);
    try {
      const res = await adminApi.createAgentInvite({ email: email.trim() || undefined });
      setInviteUrl(res.inviteUrl);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/agents/registration" className="text-sm text-admin-700 hover:underline">
          ← {vi.agentCenter.onboardingTitle}
        </Link>
        <h2 className="mt-2 text-lg font-semibold">{vi.agentCenter.registrationInviteTitle}</h2>
        <p className="text-sm text-zinc-500">{vi.agentCenter.registrationInviteHint}</p>
      </div>
      {error && <ErrorMessage message={error} />}
      <Card className="max-w-lg space-y-4">
        <p className="text-sm text-zinc-600">
          Chế độ đăng ký hiện tại: <strong>{mode}</strong>
        </p>
        <div>
          <Label>{vi.agentCenter.inviteEmail}</Label>
          <Input className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button disabled={loading} onClick={() => void createInvite()}>
          {loading ? vi.app.loading : vi.agentCenter.createInvite}
        </Button>
        {inviteUrl && (
          <p className="break-all rounded-lg bg-zinc-50 p-3 text-xs font-mono">{inviteUrl}</p>
        )}
      </Card>
    </div>
  );
}
