import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAINTENANCE_MODES } from '../entities/maintenance.constants';
import { MaintenanceMode } from '../../settings/entities/settings.constants';
import { MaintenanceModuleKey } from '../../settings/entities/settings.constants';

class MaintenanceBannerDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(64) icon?: string;
  @IsOptional() @IsString() @MaxLength(32) color?: string;
  @IsOptional() @IsString() @MaxLength(128) buttonText?: string;
  @IsOptional() @IsString() @MaxLength(512) buttonLink?: string;
  @IsOptional() @IsString() startAt?: string | null;
  @IsOptional() @IsString() endAt?: string | null;
}

class MaintenanceScheduleDto {
  @IsOptional() @IsString() startAt?: string | null;
  @IsOptional() @IsString() endAt?: string | null;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsBoolean() autoEnable?: boolean;
  @IsOptional() @IsBoolean() autoDisable?: boolean;
}

class MaintenancePartnerDto {
  @IsOptional() @IsBoolean() allowDuringMaintenance?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) whitelistAgentIds?: string[];
}

class MaintenanceCustomerPageDto {
  @IsOptional() @IsString() @MaxLength(512) supportLink?: string;
  @IsOptional() @IsString() @MaxLength(256) telegram?: string;
  @IsOptional() @IsString() @MaxLength(256) facebook?: string;
  @IsOptional() @IsString() @MaxLength(64) hotline?: string;
  @IsOptional() @IsString() estimatedFinish?: string | null;
}

export class UpdateMaintenanceDto {
  @IsOptional()
  @IsIn(MAINTENANCE_MODES)
  mode?: MaintenanceMode;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsObject()
  modules?: Partial<Record<MaintenanceModuleKey, boolean>>;

  @IsOptional()
  @ValidateNested()
  @Type(() => MaintenanceBannerDto)
  banner?: MaintenanceBannerDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MaintenanceScheduleDto)
  schedule?: MaintenanceScheduleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MaintenancePartnerDto)
  partner?: MaintenancePartnerDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MaintenanceCustomerPageDto)
  customerPage?: MaintenanceCustomerPageDto;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class MaintenanceScheduleApplyDto {
  @IsOptional()
  @IsString()
  startAt?: string;

  @IsOptional()
  @IsString()
  endAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  autoEnable?: boolean;

  @IsOptional()
  @IsBoolean()
  autoDisable?: boolean;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class MaintenancePreviewDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => MaintenanceBannerDto)
  banner?: MaintenanceBannerDto;

  @IsOptional()
  @IsIn(MAINTENANCE_MODES)
  mode?: MaintenanceMode;
}
