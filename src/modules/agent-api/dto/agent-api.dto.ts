import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class BuyCardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  product_code!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  request_id!: string;
}
