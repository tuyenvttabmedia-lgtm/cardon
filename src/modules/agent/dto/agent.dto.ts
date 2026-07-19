import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AgentAccountType } from '@prisma/client';

export class RegisterAgentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  companyName!: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  contactEmail?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  inviteToken?: string;
}

export class SubmitKycDto {
  @IsEnum(AgentAccountType)
  accountType!: AgentAccountType;

  @IsObject()
  profile!: Record<string, unknown>;

  @IsObject()
  documents!: Record<string, string>;

  @IsObject()
  businessProfile!: Record<string, unknown>;

  /** @deprecated Legacy clients — server derives from profile/documents */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  documentFront?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  documentBack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  businessLicense?: string;
}

export class UploadKycDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  field!: string;
}

export class RejectKycDto {
  @IsString()
  @IsOptional()
  @MaxLength(512)
  reason?: string;
}

export class RequestMoreInfoKycDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;

  @IsOptional()
  fields?: string[];
}

export class CreditAgentDto {
  @IsUUID()
  agentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  amount!: string;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  note?: string;
}

export class SuspendAgentDto {
  @IsString()
  @IsOptional()
  @MaxLength(512)
  reason?: string;
}
