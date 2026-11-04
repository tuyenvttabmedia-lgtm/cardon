import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const byCode = await prisma.$queryRaw`
  SELECT pr.code, ppm.status, count(*)::int AS n
  FROM provider_product_mappings ppm
  JOIN providers pr ON pr.id = ppm.provider_id
  WHERE pr.code IN ('AIRALO', 'ESIM_GO')
  GROUP BY 1, 2
  ORDER BY 1, 2
`;

console.log(JSON.stringify(byCode, null, 2));
await prisma.$disconnect();
