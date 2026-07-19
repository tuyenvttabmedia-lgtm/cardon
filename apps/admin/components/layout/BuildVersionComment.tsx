import { BuildInfoService } from '@/lib/build-version';

export function BuildVersionComment() {
  return (
    <span
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: BuildInfoService.htmlComment('CardOn Admin') }}
    />
  );
}
