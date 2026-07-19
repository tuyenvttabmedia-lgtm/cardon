'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import { adminApi } from '@/services/api-client';

const PIN_VIEW_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

export function CardPinField({
  orderId,
  cardId,
  pin,
  pinMasked,
}: {
  orderId: string;
  cardId: string;
  pin: string | null;
  pinMasked: string | null;
}) {
  const { user } = useAuth();
  const [revealed, setRevealed] = useState(false);
  const canView = user && PIN_VIEW_ROLES.has(user.role) && Boolean(pin);

  if (!canView) {
    return (
      <div>
        <p className="text-xs text-zinc-500">PIN</p>
        <p className="font-mono text-sm">{pinMasked ?? '************'}</p>
      </div>
    );
  }

  const display = revealed && pin ? pin : pinMasked ?? '**** **** ****';

  async function copyPin() {
    if (!pin) return;
    await navigator.clipboard.writeText(pin.replace(/\s/g, ''));
    await adminApi.recordPinCopied(orderId, cardId);
  }

  async function revealPin() {
    if (!pin) return;
    setRevealed(true);
    await adminApi.recordPinViewed(orderId, cardId);
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs text-zinc-500">PIN</p>
        <p className="font-mono text-sm">{display}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!revealed && pin && (
          <Button size="sm" variant="secondary" onClick={() => void revealPin()}>
            Xem mã
          </Button>
        )}
        {revealed && pin && (
          <Button size="sm" variant="ghost" onClick={() => void copyPin()}>
            Copy
          </Button>
        )}
      </div>
    </div>
  );
}
