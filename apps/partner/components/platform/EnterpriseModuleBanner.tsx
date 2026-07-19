import { Card } from '@/components/ui/Card';

export function EnterpriseModuleBanner() {
  return (
    <Card className="border-dashed border-amber-300 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">Future Enterprise Module</p>
      <p className="mt-1 text-amber-800">
        Tính năng này tạm ẩn khỏi menu. Sẽ trở lại trong Phase 6040 — Enterprise Finance.
      </p>
    </Card>
  );
}
