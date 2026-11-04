'use client';

import Link from 'next/link';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';

export default function SettingsEsimGoRetiredPage() {
  return (
    <RequireRole role="SUPER_ADMIN">
      <Card className="max-w-xl space-y-4">
        <p className="text-sm font-medium text-slate-900">eSIM Go đã ngừng dùng</p>
        <p className="text-sm text-slate-600">
          Runtime eSIM chỉ còn Airalo. Token eSIM Go không còn hiệu lực. Dùng trang cấu hình Airalo
          để lưu client_id / client_secret và đọc catalogue.
        </p>
        <Link href="/configuration/airalo">
          <Button type="button">Mở cấu hình Airalo</Button>
        </Link>
      </Card>
    </RequireRole>
  );
}
