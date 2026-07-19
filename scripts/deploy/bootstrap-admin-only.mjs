import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@cardon.vn';
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (!password) throw new Error('SEED_SUPER_ADMIN_PASSWORD missing');

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { role: UserRole.SUPER_ADMIN, status: 'ACTIVE', passwordHash },
    create: { email, passwordHash, role: UserRole.SUPER_ADMIN, status: 'ACTIVE' },
  });
  console.log('[bootstrap-admin] SUPER_ADMIN ready:', email);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
