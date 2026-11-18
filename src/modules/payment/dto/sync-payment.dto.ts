import { IsEmail, IsOptional } from 'class-validator';

export class SyncPaymentDto {
  /** Required for guest orders — must match orders.guest_email. */
  @IsOptional()
  @IsEmail()
  guestEmail?: string;
}
