import type { Prisma } from '@prisma/client';

/**
 * The only user shape the API ever returns. Never includes password hash, token version,
 * lockout counters or other security fields (FR-AUTH-11).
 */
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
