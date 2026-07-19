'use client';

import { useEffect, useRef } from 'react';

export function SepayPgCheckoutRedirect({
  checkoutUrl,
  checkoutFormFields,
}: {
  checkoutUrl: string;
  checkoutFormFields: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.submit();
  }, [checkoutUrl, checkoutFormFields]);

  return (
    <form ref={formRef} action={checkoutUrl} method="POST" className="hidden">
      {Object.entries(checkoutFormFields).map(([field, value]) => (
        <input key={field} type="hidden" name={field} value={value} />
      ))}
    </form>
  );
}
