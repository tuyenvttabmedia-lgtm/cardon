import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AccountService } from '../../auth/services/account.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { ChangePasswordDto } from '../dto/admin-operation.dto';

const ADMIN_PORTAL_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.SUPPORT,
  UserRole.MARKETING,
];

@Controller('admin/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_PORTAL_ROLES)
export class AdminMeController {
  constructor(private readonly accountService: AccountService) {}

  @Post('change-password')
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.accountService.changePassword(user.id, dto);
  }
}
