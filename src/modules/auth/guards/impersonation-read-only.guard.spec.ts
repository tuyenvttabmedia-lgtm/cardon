import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ImpersonationReadOnlyGuard } from './impersonation-read-only.guard';

function ctx(method: string, user?: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, user }) }),
  } as unknown as ExecutionContext;
}

describe('ImpersonationReadOnlyGuard', () => {
  const guard = new ImpersonationReadOnlyGuard();
  const impersonating = { id: 'u1', impersonatedBy: 'admin-1', impersonationSessionId: 's1' };

  it('allows non-impersonated writes', () => {
    expect(guard.canActivate(ctx('POST', { id: 'u1' }))).toBe(true);
  });

  it('allows impersonated reads', () => {
    expect(guard.canActivate(ctx('GET', impersonating))).toBe(true);
    expect(guard.canActivate(ctx('HEAD', impersonating))).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('blocks impersonated %s', (method) => {
    expect(() => guard.canActivate(ctx(method, impersonating))).toThrow(ForbiddenException);
  });

  it('blocks writes even when the readOnly claim is false or missing', () => {
    expect(() =>
      guard.canActivate(ctx('POST', { ...impersonating, impersonationReadOnly: false })),
    ).toThrow(ForbiddenException);
  });
});
