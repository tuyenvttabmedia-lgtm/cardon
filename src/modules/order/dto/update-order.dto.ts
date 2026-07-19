import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  customerNote?: string;
}
