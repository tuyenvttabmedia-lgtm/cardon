/**
 * Remove temporary Tier-1 UAT agent accounts (email prefix uat-tier1-).
 * docker exec cardon-prod-api node /app/scripts/deploy/cleanup-uat-tier1-agents.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      email: { startsWith: 'uat-tier1-' },
      deletedAt: null,
    },
    select: { id: true, email: true },
  });

  if (users.length === 0) {
    console.log('[cleanup-uat] No uat-tier1-* accounts found');
    return;
  }

  const ids = users.map((u) => u.id);
  console.log('[cleanup-uat] Removing:', users.map((u) => u.email).join(', '));

  await prisma.$transaction(async (tx) => {
    const agents = await tx.agent.findMany({
      where: { userId: { in: ids } },
      select: { id: true },
    });
    const agentIds = agents.map((a) => a.id);

    if (agentIds.length) {
      await tx.agentKyc.deleteMany({ where: { agentId: { in: agentIds } } });
      await tx.agent.deleteMany({ where: { id: { in: agentIds } } });
    }

    await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await tx.emailVerificationToken.deleteMany({ where: { userId: { in: ids } } });
    await tx.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
    await tx.user.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date(), status: 'SUSPENDED' },
    });
  });

  console.log('[cleanup-uat] Done. Removed', users.length, 'account(s)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
