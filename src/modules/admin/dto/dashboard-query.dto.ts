import { IsOptional, IsString } from 'class-validator';

/**
 * Invalid / missing period → service normalizes to `today`
 * (see resolveDashboardPeriodRange). Avoid 400 on unknown values.
 */
export class DashboardQueryDto {
  @IsOptional()
  @IsString()
  period?: string;
}
