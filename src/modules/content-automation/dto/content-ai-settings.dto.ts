import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CONTENT_AI_PROVIDER_OPENAI_COMPATIBLE } from '../entities/content-ai.constants';

export class UpdateContentAiSettingsDto {
  @IsOptional()
  @IsString()
  @IsIn([CONTENT_AI_PROVIDER_OPENAI_COMPATIBLE])
  providerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  model?: string;

  /** Plain API key — encrypted on save. Omit or mask to keep existing. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(5_000)
  @Max(300_000)
  timeoutMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(256)
  @Max(32_768)
  maxTokens?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;
}
