import type { User } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { hashPassword } from '../../src/common/auth/password';
import type { SystemRole } from '../../src/common/auth/permissions';
import { seedBase } from '../../src/database/seed/base';

export { prisma };

/**
 * Empties every table (TRUNCATE bypasses the append-only row triggers by design) and
 * re-inserts base reference data.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  await seedBase(prisma);
}

export const DEFAULT_PASSWORD = 'Password123';

let counter = 0;

export async function createUser(
  options: { role?: SystemRole | string; email?: string; password?: string; isActive?: boolean; name?: string } = {},
): Promise<User> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: options.role ?? 'STAFF' } });
  counter += 1;
  return prisma.user.create({
    data: {
      name: options.name ?? `Test User ${counter}`,
      email: options.email ?? `user${counter}.${Date.now()}@test.local`,
      passwordHash: await hashPassword(options.password ?? DEFAULT_PASSWORD),
      roleId: role.id,
      isActive: options.isActive ?? true,
    },
  });
}
