import { SupportTicketPriority, SupportTicketStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSupportTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  subject!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;
}

export class ReplySupportTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class ListSupportTicketsQueryDto {
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ticketCode?: string;
}
