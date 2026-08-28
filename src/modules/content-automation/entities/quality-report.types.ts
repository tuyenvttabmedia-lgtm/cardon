export const QUALITY_REPORT_VERSION = '1' as const;

export interface QualityCheckItem {
  code: string;
  layer: 1 | 2 | 3;
  severity: 'error' | 'warning' | 'info';
  message: string;
  passed: boolean;
}

export interface QualityReportV1 {
  version: typeof QUALITY_REPORT_VERSION;
  checkedAt: string;
  passed: boolean;
  layer1Passed: boolean;
  layer2Passed: boolean;
  layer3Score?: number;
  checks: QualityCheckItem[];
}

export function isQualityReportV1(raw: unknown): raw is QualityReportV1 {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as QualityReportV1).version === QUALITY_REPORT_VERSION
  );
}
