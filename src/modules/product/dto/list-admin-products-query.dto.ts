import { IsIn, IsOptional } from 'class-validator';

export class ListAdminProductsQueryDto {
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  statusFilter?: 'active' | 'inactive' | 'all';
}
