'use client';

import { useEffect, useRef } from 'react';
import { orderedSepayCheckoutEntries } from '@/lib/sepay-checkout-form';

export function SepayPgCheckoutRedirect({
  checkoutUrl,
  checkoutFormFields,
}: {
  checkoutUrl: string;
  checkoutFormFields: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);
  const fields = orderedSepayCheckoutEntries(checkoutFormFields);

  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    formRef.current?.submit();
  }, [checkoutUrl, checkoutFormFields]);

  return (
    <form ref={formRef} action={checkoutUrl} method="POST" className="hidden">
      {fields.map(([field, value]) => (
        <input key={field} type="hidden" name={field} value={value} />
      ))}
    </form>
  );
}
