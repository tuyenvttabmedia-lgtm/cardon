import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Match } from '../../../common/decorators/match.decorator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username may only contain letters, numbers, and underscores',
  })
  username!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(128)
  fullName!: string;

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

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{9,12}$/, {
    message: 'Identity number must be 9–12 digits',
  })
  identityNumber?: string;

  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms and conditions' })
  acceptTerms!: boolean;
}
