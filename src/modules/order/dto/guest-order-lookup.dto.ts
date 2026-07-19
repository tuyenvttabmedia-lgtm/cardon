import { IsEmail, IsString, MaxLength } from 'class-validator';

export class GuestOrderLookupDto {
  @IsString()
  @MaxLength(64)
  orderCode!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;
}
