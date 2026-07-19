'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import { adminApi } from '@/services/api-client';
import { downloadArrayBuffer, formatVnd, getApiBaseUrl } from '@/lib/utils';
import { getAccessToken } from '@/lib/auth-storage';
import type { AdminDeliveryItem } from '@/types/api';

const PIN_VIEW_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

function buildBulkCopyText(items: AdminDeliveryItem[]): string {
  return items
    .map((item) => {
      const lines = [
        item.productName,
        formatVnd(item.faceValue),
        '',
        `Serial: ${item.serial ?? '—'}`,
        `PIN: ${item.pin ?? item.pinMasked ?? '—'}`,
      ];
      return lines.join('\n');
    })
    .join('\n\n');
}

export function CardDeliveryTools({
  orderId,
  items,
}: {
  orderId: string;
  items: AdminDeliveryItem[];
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const canExport = user && PIN_VIEW_ROLES.has(user.role);

  if (!canExport || items.length <= 1) {
    return null;
  }

  async function copyAll() {
    const text = buildBulkCopyText(items);
    await navigator.clipboard.writeText(text);
    for (const item of items) {
      if (item.pin && item.cardId) {
        await adminApi.recordPinViewed(orderId, item.cardId ?? item.id);
      }
    }
  }

  async function exportExcel() {
    setBusy(true);
    try {
      const token = getAccessToken();
      const response = await fetch(
        `${getApiBaseUrl()}/admin/orders/${orderId}/delivery/export`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        },
      );
      if (!response.ok) throw new Error('Export failed');
      const buffer = await response.arrayBuffer();
      downloadArrayBuffer(
        buffer,
        `order-${orderId}-cards.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 border-b border-zinc-100 pb-4">
      <Button size="sm" variant="secondary" onClick={() => void copyAll()}>
        Copy tất cả mã thẻ
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void exportExcel()}>
        {busy ? 'Đang xuất…' : 'Xuất Excel'}
      </Button>
    </div>
  );
}
