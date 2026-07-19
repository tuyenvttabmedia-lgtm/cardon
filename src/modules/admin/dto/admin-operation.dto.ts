import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole, UserStatus } from '@prisma/client';
import { ADMIN_PAGINATION_MAX } from '../entities/admin.constants';

export class AdminSearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  q!: string;
}

export class AdminCustomerQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_PAGINATION_MAX)
  take?: number;
}

export class AdminCustomerDetailQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderSkip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_PAGINATION_MAX)
  orderTake?: number;
}

export class AdminUpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+84|0)[0-9]{9,10}$/)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_]+$/)
  username?: string;
}

export class AdminCreateStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(128)
  fullName!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}

export class AdminUpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  fullName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class AdminCreateAgentInviteDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}

export class AdminResetCustomerPasswordDto {
  @IsOptional()
  @IsIn(['link', 'temp'])
  mode?: 'link' | 'temp';
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+84|0)[0-9]{9,10}$/)
  phone?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  oldPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;

  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}
