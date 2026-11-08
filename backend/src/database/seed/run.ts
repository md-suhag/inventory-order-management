/**
 * `npm run db:seed` — base reference data + initial administrator.
 * The admin is created only if no user with the ADMIN role exists yet.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { SystemRole } from '../../common/auth/permissions';
import { passwordSchema } from '../../common/auth/password';
import { seedBase } from './base';

const adminEnv = z.object({
  SEED_ADMIN_NAME: z.string().trim().min(1).default('System Administrator'),
  SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  SEED_ADMIN_PASSWORD: passwordSchema,
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
});

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedBase(prisma);
    console.log('✔ base reference data');

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: SystemRole.ADMIN } });
    const adminExists = await prisma.user.count({ where: { roleId: adminRole.id } });
    if (adminExists) {
      console.log('• admin user already exists — skipped');
      return;
    }
    const parsed = adminEnv.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `Cannot create the initial admin: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      );
    }
    const { SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, BCRYPT_ROUNDS } = parsed.data;
    await prisma.user.create({
      data: {
        name: SEED_ADMIN_NAME,
        email: SEED_ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(SEED_ADMIN_PASSWORD, BCRYPT_ROUNDS),
        roleId: adminRole.id,
      },
    });
    console.log(`✔ admin user ${SEED_ADMIN_EMAIL} (change the password after first login)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
