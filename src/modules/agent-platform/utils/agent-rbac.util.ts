import { ForbiddenException } from '@nestjs/common';
import {
  AgentPlatformPermission,
  AgentPlatformRole,
  roleHasPermission,
} from '../entities/agent-platform.constants';
import type { AgentMemberContext } from '../../agent-organization/services/agent-member-context.service';
import { AgentMemberContextService } from '../../agent-organization/services/agent-member-context.service';

export function assertAgentPermission(
  role: string | null | undefined,
  permission: AgentPlatformPermission,
  impersonationReadOnly = false,
) {
  if (impersonationReadOnly && isBlockedWhileImpersonating(permission)) {
    throw new ForbiddenException('Không được phép khi đang impersonate (read-only)');
  }
  if (!role || !roleHasPermission(role as AgentPlatformRole, permission)) {
    throw new ForbiddenException('Không có quyền truy cập');
  }
}

export function assertAgentContextPermission(
  ctx: AgentMemberContext,
  permission: AgentPlatformPermission,
  memberContext: AgentMemberContextService,
) {
  memberContext.assertPermission(ctx, permission);
}

function isBlockedWhileImpersonating(permission: AgentPlatformPermission): boolean {
  return (
    permission.endsWith('.manage') ||
    permission.endsWith('.export') ||
    permission === 'retry.manage' ||
    permission === 'api.manage'
  );
}
