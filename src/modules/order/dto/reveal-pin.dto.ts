import { IsEmail, IsOptional, MaxLength } from 'class-validator';

export class RevealPinDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;
}
