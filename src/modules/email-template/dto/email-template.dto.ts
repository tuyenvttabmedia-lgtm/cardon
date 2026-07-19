import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertEmailTemplateDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsString()
  @MaxLength(255)
  subject!: string;

  @IsString()
  htmlBody!: string;

  @IsOptional()
  @IsString()
  textBody?: string;

  @IsOptional()
  @IsArray()
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertEmailTemplatesDto {
  @IsArray()
  templates!: UpsertEmailTemplateDto[];
}
