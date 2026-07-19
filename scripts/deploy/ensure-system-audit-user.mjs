/**
 * Ensure system@cardon.local exists for ProviderAuditService (required for buyCard).
 * Usage: docker exec cardon-prod-api node /app/scripts/deploy/ensure-system-audit-user.mjs
 */
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();
const SYSTEM_AUDIT_EMAIL = 'system@cardon.local';
// Login disabled — audit actor only.
const PLACEHOLDER_PASSWORD_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

async function main() {
  const user = await prisma.user.upsert({
    where: { email: SYSTEM_AUDIT_EMAIL },
    update: { role: UserRole.ADMIN, status: 'ACTIVE' },
    create: {
      email: SYSTEM_AUDIT_EMAIL,
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      fullName: 'System Provider Audit',
    },
    select: { id: true, email: true },
  });

  console.log(JSON.stringify({ ok: true, user }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
