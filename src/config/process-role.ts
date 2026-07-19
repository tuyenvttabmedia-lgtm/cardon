export type AppProcessRole = 'api' | 'worker' | 'all';

export function getAppProcessRole(): AppProcessRole {
  const role = process.env.APP_ROLE ?? 'all';
  if (role === 'api' || role === 'worker' || role === 'all') {
    return role;
  }
  return 'all';
}

export function shouldRegisterWorkers(): boolean {
  const role = getAppProcessRole();
  return role === 'worker' || role === 'all';
}

export function shouldRegisterHttp(): boolean {
  const role = getAppProcessRole();
  return role === 'api' || role === 'all';
}
