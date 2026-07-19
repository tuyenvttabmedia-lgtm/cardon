'use client';

import Link from 'next/link';
import { buildCheckoutRedirectUrl } from '@/lib/checkout-persistence';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LoginRequiredModal({ open, onClose }: Props) {
  if (!open) return null;

  const redirect = encodeURIComponent(buildCheckoutRedirectUrl());

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
        <h2 className="text-lg font-bold text-cardon-navy">Đăng nhập để tiếp tục giao dịch</h2>
        <p className="mt-2 text-sm text-cardon-gray">
          Đăng nhập giúp bảo vệ giao dịch và hỗ trợ xử lý khiếu nại khi cần.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/login?redirect=${redirect}`}
            className="flex-1 rounded-xl bg-cardon-blue py-2.5 text-center text-sm font-semibold text-white hover:bg-cardon-navy"
            onClick={onClose}
          >
            Đăng nhập
          </Link>
          <Link
            href={`/register?redirect=${redirect}`}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-center text-sm font-semibold text-cardon-navy hover:bg-gray-50"
            onClick={onClose}
          >
            Tạo tài khoản
          </Link>
        </div>
        <button type="button" className="mt-4 w-full text-sm text-cardon-gray hover:text-cardon-navy" onClick={onClose}>
          Đóng
        </button>
      </div>
    </div>
  );
}
