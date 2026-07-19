import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Match } from '../../../common/decorators/match.decorator';

export enum AgentRegisterAccountType {
  PERSONAL = 'PERSONAL',
  HOUSEHOLD = 'HOUSEHOLD',
  COMPANY = 'COMPANY',
}

export class AgentRegisterDto {
  @IsEnum(AgentRegisterAccountType)
  accountType!: AgentRegisterAccountType;

  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^(\+84|0)[0-9]{9,10}$/, {
    message: 'Phone must be a valid Vietnamese number',
  })
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(8)
  @Match('password', { message: 'Password confirmation does not match' })
  confirmPassword!: string;

  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms and conditions' })
  acceptTerms!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  inviteToken?: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(16)
  token!: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}
