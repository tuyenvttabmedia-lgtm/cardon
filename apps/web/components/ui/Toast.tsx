'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ToastProps {
  message: string;
  variant?: 'success' | 'error';
  onClose: () => void;
  durationMs?: number;
}

export function Toast({ message, variant = 'success', onClose, durationMs = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, durationMs);
    return () => clearTimeout(timer);
  }, [onClose, durationMs]);

  return (
    <div
      className={cn(
        'fixed bottom-20 left-1/2 z-[100] -translate-x-1/2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg md:bottom-8',
        variant === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
      )}
      role="status"
    >
      {message}
    </div>
  );
}
