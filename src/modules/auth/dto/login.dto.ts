import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** Retail/admin/partner login identity — email only (field name kept for API compat). */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Please enter a valid email address' })
  identifier!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
