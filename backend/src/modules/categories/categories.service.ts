import type { Prisma, RecordStatus } from '@prisma/client';
import { prisma, type Db } from '../../config/prisma';
import { diffChanges, recordAudit, type RequestContext } from '../../common/audit/audit';
import { withTransaction, type Tx } from '../../common/db/transaction';
import { isUniqueViolation } from '../../common/errors/db-errors';
import { ErrorCode, conflict, notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import type {
  CategorySortField,
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from './categories.schemas';

const categorySelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: true } },
} satisfies Prisma.CategorySelect;

type CategoryRow = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;

export interface CategoryView extends Omit<CategoryRow, '_count'> {
  productCount: number;
}

function present({ _count, ...rest }: CategoryRow): CategoryView {
  return { ...rest, productCount: _count.products };
}

export async function listCategories(query: ListCategoriesQuery): Promise<Paginated<CategoryView>> {
  const args = buildListArgs<CategorySortField, Prisma.CategoryWhereInput, Prisma.CategoryOrderByWithRelationInput>(
    query,
    {
      searchFields: ['name', 'description'],
      sortFields: { name: 'name', createdAt: 'createdAt', productCount: 'products._count' },
      defaultSort: [{ field: 'name', direction: 'asc' }],
    },
    [query.status ? { status: { in: query.status } } : undefined],
  );
  const page = await paginate(
    query,
    () => prisma.category.findMany({ ...args, select: categorySelect }),
    () => prisma.category.count({ where: args.where }),
  );
  return { ...page, data: page.data.map(present) };
}

export async function getCategory(id: string): Promise<CategoryView> {
  const row = await prisma.category.findUnique({ where: { id }, select: categorySelect });
  if (!row) throw notFound('Category');
  return present(row);
}

const duplicateName = () =>
  conflict('A category with this name already exists', ErrorCode.DUPLICATE, [{ field: 'name', message: 'Must be unique' }]);

/** Case-insensitive uniqueness (FR-CAT-01); the DB unique index is the backstop. */
async function assertNameFree(db: Db, name: string, exceptId?: string): Promise<void> {
  const clash = await db.category.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw duplicateName();
}

/** Locks the category row; product inserts/updates referencing it (FK KEY SHARE) wait for us. */
async function lockCategory(tx: Tx, id: string): Promise<CategoryRow> {
  await tx.$queryRaw`SELECT id FROM categories WHERE id = ${id}::uuid FOR UPDATE`;
  const row = await tx.category.findUnique({ where: { id }, select: categorySelect });
  if (!row) throw notFound('Category');
  return row;
}

async function withDuplicateMapping<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err, 'name')) throw duplicateName();
    throw err;
  }
}

export function createCategory(input: CreateCategoryInput, ctx: RequestContext): Promise<CategoryView> {
  return withDuplicateMapping(() =>
    withTransaction(async (tx) => {
      await assertNameFree(tx, input.name);
      const row = await tx.category.create({
        data: { name: input.name, description: input.description ?? null },
        select: categorySelect,
      });
      await recordAudit(tx, ctx, {
        action: 'category.created',
        entityType: 'category',
        entityId: row.id,
        metadata: { name: row.name },
      });
      return present(row);
    }),
  );
}

export function updateCategory(id: string, input: UpdateCategoryInput, ctx: RequestContext): Promise<CategoryView> {
  return withDuplicateMapping(() =>
    withTransaction(async (tx) => {
      const before = await lockCategory(tx, id);
      if (input.name !== undefined && input.name !== before.name) await assertNameFree(tx, input.name, id);
      const row = await tx.category.update({
        where: { id },
        data: { name: input.name, description: input.description },
        select: categorySelect,
      });
      const changes = diffChanges(
        { name: before.name, description: before.description },
        { name: input.name, description: input.description },
      );
      if (Object.keys(changes).length) {
        await recordAudit(tx, ctx, {
          action: 'category.updated',
          entityType: 'category',
          entityId: id,
          metadata: { changes } as Prisma.InputJsonValue,
        });
      }
      return present(row);
    }),
  );
}

/**
 * Archives / unarchives; repeating the current state is a no-op. Archived categories cannot be
 * assigned to products, but products already in them keep the reference (FR-CAT-04).
 */
export function setCategoryStatus(id: string, status: RecordStatus, ctx: RequestContext): Promise<CategoryView> {
  return withTransaction(async (tx) => {
    const before = await lockCategory(tx, id);
    if (before.status === status) return present(before);
    const row = await tx.category.update({ where: { id }, data: { status }, select: categorySelect });
    await recordAudit(tx, ctx, {
      action: status === 'ARCHIVED' ? 'category.archived' : 'category.unarchived',
      entityType: 'category',
      entityId: id,
    });
    return present(row);
  });
}

/** Hard delete only while no product references it; otherwise archive (BR-CAT-01, FR-CAT-03). */
export async function deleteCategory(id: string, ctx: RequestContext): Promise<void> {
  await withTransaction(async (tx) => {
    const row = await lockCategory(tx, id);
    if (row._count.products > 0) {
      throw conflict(
        `Category is used by ${row._count.products} product(s); archive it instead`,
        ErrorCode.REFERENCED,
      );
    }
    await tx.category.delete({ where: { id } });
    await recordAudit(tx, ctx, {
      action: 'category.deleted',
      entityType: 'category',
      entityId: id,
      metadata: { name: row.name },
    });
  });
}
