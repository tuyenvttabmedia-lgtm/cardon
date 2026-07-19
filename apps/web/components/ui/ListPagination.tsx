'use client';

import { Button } from '@/components/ui/Button';
import { PageSizeSelect } from '@/components/ui/PageSizeSelect';

export function ListPagination({
  skip,
  take,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  itemLabel = 'mục',
}: {
  skip: number;
  take: number;
  total: number;
  onPageChange: (nextSkip: number) => void;
  onPageSizeChange?: (nextTake: number) => void;
  pageSizeOptions?: readonly number[];
  itemLabel?: string;
}) {
  if (total === 0) return null;

  const page = Math.floor(skip / take) + 1;
  const totalPages = Math.max(1, Math.ceil(total / take));
  const showPager = total > take;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <PageSizeSelect
            value={take}
            onChange={(next) => {
              onPageSizeChange(next);
              onPageChange(0);
            }}
            options={pageSizeOptions}
          />
        )}
        <span className="text-cardon-gray">
          {total > 0
            ? `${skip + 1}–${Math.min(skip + take, total)} / ${total} ${itemLabel}`
            : `0 ${itemLabel}`}
        </span>
      </div>
      {showPager && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={skip === 0}
            onClick={() => onPageChange(Math.max(0, skip - take))}
          >
            Trang trước
          </Button>
          <span className="text-cardon-gray">
            {page}/{totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={skip + take >= total}
            onClick={() => onPageChange(skip + take)}
          >
            Trang sau
          </Button>
        </div>
      )}
    </div>
  );
}
