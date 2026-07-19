import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitContactMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}

export class ListContactMessagesQueryDto {
  @IsOptional()
  @IsString()
  status?: 'NEW' | 'PROCESSED';
}
