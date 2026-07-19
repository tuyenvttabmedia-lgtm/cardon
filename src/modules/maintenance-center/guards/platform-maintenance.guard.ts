import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  AGENT_API_CONTEXT_KEY,
  AgentApiRequest,
} from '../../agent-api/guards/agent-api-auth.guard';
import { MAINTENANCE_MODULE_KEY } from '../decorators/maintenance-module.decorator';
import { MaintenanceModuleKey } from '../../settings/entities/settings.constants';
import { MaintenanceAvailabilityService } from '../services/maintenance-availability.service';

@Injectable()
export class PlatformMaintenanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly availability: MaintenanceAvailabilityService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const module = this.reflector.get<MaintenanceModuleKey | undefined>(
      MAINTENANCE_MODULE_KEY,
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest<AgentApiRequest & { user?: AuthenticatedUser }>();
    const user = request.user;
    const path = String(request.path ?? request.url ?? '');
    const isAdminRoute = path.includes('/admin/');
    const agentContext = request[AGENT_API_CONTEXT_KEY];

    this.availability.assertCustomerMutationAllowed({
      userRole: user?.role,
      agentId: agentContext?.agent?.id ?? null,
      isAdminRoute,
      module,
    });

    return true;
  }
}
