import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Match } from '../../../common/decorators/match.decorator';
import {
  normalizeIdentityNumber,
  normalizeRegisterPhone,
} from '../entities/normalize-register-phone';
import { normalizeRegisterUsername } from '../entities/normalize-register-username';

export class RegisterDto {
  /**
   * Optional display alias — login identity is email.
   * Empty/omitted → server derives a free handle from the email local-part.
   */
  @Transform(({ value }) => {
    const normalized = normalizeRegisterUsername(value);
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsOptional()
  @IsString()
  @MinLength(3, {
    message: 'Username must be at least 3 characters (letters, numbers, underscores)',
  })
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username may only contain letters, numbers, and underscores',
  })
  username?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(128)
  fullName!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @Transform(({ value }) => normalizeRegisterPhone(value))
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

  /** Optional legacy field — retail form no longer collects CCCD/CMND. */
  @Transform(({ value }) => normalizeIdentityNumber(value))
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @Matches(/^[0-9]{9,12}$/, {
    message: 'Identity number must be 9–12 digits',
  })
  identityNumber?: string;

  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms and conditions' })
  acceptTerms!: boolean;

  /** Cloudflare Turnstile token — required only when TURNSTILE_ENABLED=true. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}
