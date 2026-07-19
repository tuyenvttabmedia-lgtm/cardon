import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { EXPORTABLE_MODULES } from '../entities/configuration-center.constants';

export class ConfigurationSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string = '';
}

export class ConfigurationImportDto {
  @IsObject()
  data!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  include_secrets?: boolean;
}

export class ConfigurationTestTelegramDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  message?: string;
}

export class ConfigurationExportQueryDto {
  @IsIn(EXPORTABLE_MODULES as unknown as string[])
  module!: (typeof EXPORTABLE_MODULES)[number];
}
