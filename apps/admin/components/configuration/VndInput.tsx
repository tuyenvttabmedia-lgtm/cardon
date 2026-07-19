'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Form';
import { formatVndDigits, parseVndDigits, validateVndAmount } from '@/lib/vnd-input';

export function VndInput({
  value,
  onChange,
  disabled,
  className,
  allowZero = true,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  allowZero?: boolean;
}) {
  const [display, setDisplay] = useState(() => formatVndDigits(value));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDisplay(formatVndDigits(value));
      setError(validateVndAmount(value, allowZero));
    }
  }, [value, focused, allowZero]);

  function commit(raw: string) {
    const parsed = parseVndDigits(raw);
    const validationError = validateVndAmount(parsed, allowZero);
    setError(validationError);
    if (!validationError) {
      onChange(parsed);
      setDisplay(formatVndDigits(parsed));
    }
  }

  return (
    <div>
      <Input
        className={className}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={display}
        aria-invalid={Boolean(error)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw !== '' && !/^[\d.\s]*$/.test(raw)) return;
          setDisplay(raw);
          const parsed = parseVndDigits(raw);
          const validationError = validateVndAmount(parsed, allowZero);
          setError(validationError);
          if (!validationError) onChange(parsed);
        }}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
