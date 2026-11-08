/**
 * Reusable list query builder (TECHNICAL_DECISIONS TD-25).
 *
 * A module declares:
 *   - which fields free-text `search` looks in (supports nested relation paths, e.g. "customer.name"),
 *   - a whitelist of sortable fields (public name → Prisma field path),
 *   - typed filters (built from its own Zod-validated query params).
 * The builder returns Prisma `where`/`orderBy`/`skip`/`take` and the pagination metadata.
 *
 * Query syntax:  ?page=2&pageSize=20&search=acme&sort=name:asc,createdAt:desc&status=ACTIVE
 */
import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
const MAX_SORT_KEYS = 3;

export type SortDirection = 'asc' | 'desc';
export interface SortSpec<F extends string = string> {
  field: F;
  direction: SortDirection;
}

/** Zod schema for the common list params; `sortFields` is the whitelist accepted in `sort`. */
export function listQuerySchema<const F extends readonly [string, ...string[]]>(sortFields: F) {
  const allowed = new Set<string>(sortFields);
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    search: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((v) => (v ? v : undefined)),
    sort: z
      .string()
      .optional()
      .transform((raw, ctx): SortSpec<F[number]>[] | undefined => {
        if (!raw) return undefined;
        const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
        if (parts.length > MAX_SORT_KEYS) {
          ctx.addIssue({ code: 'custom', message: `At most ${MAX_SORT_KEYS} sort keys are allowed` });
          return z.NEVER;
        }
        const specs: SortSpec<F[number]>[] = [];
        for (const part of parts) {
          const [field, dir = 'asc'] = part.split(':');
          if (!field || !allowed.has(field) || (dir !== 'asc' && dir !== 'desc')) {
            ctx.addIssue({
              code: 'custom',
              message: `Invalid sort "${part}". Use field:asc|desc with field in: ${[...allowed].join(', ')}`,
            });
            return z.NEVER;
          }
          specs.push({ field: field as F[number], direction: dir });
        }
        return specs;
      }),
  });
}

export type ListQueryInput<F extends string = string> = {
  page: number;
  pageSize: number;
  search?: string;
  sort?: SortSpec<F>[];
};

export interface ListConfig<F extends string, TWhere, TOrderBy> {
  /** Field paths searched case-insensitively with `contains` (OR-ed). Dotted paths traverse relations. */
  searchFields?: string[];
  /** Custom search clause (overrides searchFields), e.g. exact match on a document number. */
  search?: (term: string) => TWhere;
  /** Public sort name → Prisma field path (dotted for relations). Unlisted fields can never be sorted on. */
  sortFields: Record<F, string>;
  defaultSort: SortSpec<F>[];
  /** Appended to every orderBy so pagination is deterministic. Defaults to `id asc`. */
  tieBreaker?: TOrderBy;
}

export interface ListArgs<TWhere, TOrderBy> {
  where: TWhere;
  orderBy: TOrderBy[];
  skip: number;
  take: number;
}

/** Builds a nested object from a dotted path: ("customer.name", v) → { customer: { name: v } }. */
export function nestPath(path: string, leaf: unknown): Record<string, unknown> {
  return path
    .split('.')
    .reverse()
    .reduce<unknown>((acc, key) => ({ [key]: acc }), leaf) as Record<string, unknown>;
}

export function buildListArgs<F extends string, TWhere, TOrderBy>(
  input: ListQueryInput<F>,
  config: ListConfig<F, TWhere, TOrderBy>,
  filters: (TWhere | undefined | null | false)[] = [],
): ListArgs<TWhere, TOrderBy> {
  const and: unknown[] = filters.filter(Boolean);

  if (input.search) {
    if (config.search) {
      and.push(config.search(input.search));
    } else if (config.searchFields?.length) {
      and.push({
        OR: config.searchFields.map((path) => nestPath(path, { contains: input.search, mode: 'insensitive' })),
      });
    }
  }

  const sort = input.sort?.length ? input.sort : config.defaultSort;
  const orderBy = sort.map((s) => nestPath(config.sortFields[s.field], s.direction) as TOrderBy);
  orderBy.push(config.tieBreaker ?? ({ id: 'asc' } as TOrderBy));

  return {
    where: (and.length ? { AND: and } : {}) as TWhere,
    orderBy,
    skip: (input.page - 1) * input.pageSize,
    take: input.pageSize,
  };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export function pageMeta(total: number, page: number, pageSize: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Runs the page query and the count query concurrently. */
export async function paginate<T>(
  input: Pick<ListQueryInput, 'page' | 'pageSize'>,
  findMany: () => Promise<T[]>,
  count: () => Promise<number>,
): Promise<Paginated<T>> {
  const [data, total] = await Promise.all([findMany(), count()]);
  return { data, meta: pageMeta(total, input.page, input.pageSize) };
}

// ---------------------------------------------------------------------------
// Query-param schema helpers for filters (query strings are always strings).
// ---------------------------------------------------------------------------

export const queryBoolean = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** `?status=ACTIVE,ARCHIVED` or repeated `?status=A&status=B` → validated enum array. */
export function queryEnumList<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1))
    .optional();
}

/** ISO date (YYYY-MM-DD) or full ISO timestamp. */
export const queryDate = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)), 'Invalid date')
  .optional();

/** `{ field: { gte, lt } }` for an inclusive [from, to] range where `to` is a whole day. */
export function dateRangeFilter(field: string, from?: Date, toExclusive?: Date): Record<string, unknown> | undefined {
  if (!from && !toExclusive) return undefined;
  return { [field]: { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } };
}
