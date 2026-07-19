'use client';

import { PlatformSection, FoundationNotice } from '@/components/platform/PlatformSection';

export default function SupportPageClient() {
  return (
    <PlatformSection title="Support" description="Agent support tickets and help center integration.">
      <FoundationNotice detail="Support module will connect to the customer support system in a later build." />
    </PlatformSection>
  );
}
