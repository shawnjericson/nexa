import { prisma } from '../../src/infrastructure/database/prisma';

export { prisma };

// permissions is reference data seeded by migrations, so it is kept.
const TABLES = [
  'comments',
  'posts',
  'refresh_tokens',
  'organization_members',
  'role_permissions',
  'roles',
  'organizations',
  'users',
];

export async function resetDatabase(): Promise<void> {
  const [row] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!row?.name.endsWith('_test')) {
    throw new Error(`Refusing to truncate non-test database "${row?.name}"`);
  }
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} CASCADE`,
  );
}
