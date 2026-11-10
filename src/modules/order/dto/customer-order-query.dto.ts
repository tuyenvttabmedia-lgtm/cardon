import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CustomerOrderQueryDto {
  @IsOptional()
  @IsIn(['all', 'processing', 'completed'])
  tab?: 'all' | 'processing' | 'completed';

  @IsOptional()
  @IsIn(['CARD', 'TOPUP', 'DATA', 'ESIM'])
  type?: 'CARD' | 'TOPUP' | 'DATA' | 'ESIM';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class AccountListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class AccountCardsQueryDto extends AccountListQueryDto {
  @IsOptional()
  @IsIn(['GAME_CARD', 'PHONE_CARD'])
  homeService?: 'GAME_CARD' | 'PHONE_CARD';
}
