import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildListArgs,
  dateRangeFilter,
  listQuerySchema,
  nestPath,
  pageMeta,
  queryBoolean,
  queryEnumList,
} from '../../src/common/query/list-query';

const schema = listQuerySchema(['name', 'createdAt', 'customer'] as const);
const config = {
  searchFields: ['name', 'email', 'customer.name'],
  sortFields: { name: 'name', createdAt: 'createdAt', customer: 'customer.name' },
  defaultSort: [{ field: 'createdAt' as const, direction: 'desc' as const }],
};

describe('listQuerySchema', () => {
  it('applies defaults and coerces numbers', () => {
    expect(schema.parse({})).toEqual({ page: 1, pageSize: 20, search: undefined, sort: undefined });
    expect(schema.parse({ page: '3', pageSize: '50' })).toMatchObject({ page: 3, pageSize: 50 });
  });

  it('rejects page size above the maximum and non-positive pages', () => {
    expect(schema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(schema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('treats blank search as no search and trims it', () => {
    expect(schema.parse({ search: '   ' }).search).toBeUndefined();
    expect(schema.parse({ search: '  acme ' }).search).toBe('acme');
  });

  it('parses multi-key sort and defaults direction to asc', () => {
    expect(schema.parse({ sort: 'name,createdAt:desc' }).sort).toEqual([
      { field: 'name', direction: 'asc' },
      { field: 'createdAt', direction: 'desc' },
    ]);
  });

  it('rejects sort fields outside the whitelist and bad directions', () => {
    expect(schema.safeParse({ sort: 'passwordHash:asc' }).success).toBe(false);
    expect(schema.safeParse({ sort: 'name:up' }).success).toBe(false);
    expect(schema.safeParse({ sort: 'name,createdAt,customer,name' }).success).toBe(false);
  });
});

describe('buildListArgs', () => {
  it('builds skip/take from page and pageSize', () => {
    const args = buildListArgs({ page: 3, pageSize: 25 }, config);
    expect(args).toMatchObject({ skip: 50, take: 25, where: {} });
  });

  it('uses the default sort plus an id tie-breaker', () => {
    expect(buildListArgs({ page: 1, pageSize: 20 }, config).orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
  });

  it('maps public sort names to nested relation paths', () => {
    const args = buildListArgs({ page: 1, pageSize: 20, sort: [{ field: 'customer', direction: 'desc' }] }, config);
    expect(args.orderBy[0]).toEqual({ customer: { name: 'desc' } });
  });

  it('ORs case-insensitive contains over search fields, including relations', () => {
    const args = buildListArgs({ page: 1, pageSize: 20, search: 'ali' }, config);
    expect(args.where).toEqual({
      AND: [
        {
          OR: [
            { name: { contains: 'ali', mode: 'insensitive' } },
            { email: { contains: 'ali', mode: 'insensitive' } },
            { customer: { name: { contains: 'ali', mode: 'insensitive' } } },
          ],
        },
      ],
    });
  });

  it('ANDs filters with search and drops empty filters', () => {
    const args = buildListArgs({ page: 1, pageSize: 20, search: 'x' }, config, [
      { status: 'ACTIVE' },
      undefined,
      false,
      { roleId: 'r1' },
    ]);
    const and = (args.where as unknown as { AND: unknown[] }).AND;
    expect(and).toHaveLength(3);
    expect(and.slice(0, 2)).toEqual([{ status: 'ACTIVE' }, { roleId: 'r1' }]);
  });

  it('prefers a custom search clause when provided', () => {
    const args = buildListArgs({ page: 1, pageSize: 20, search: 'SO-1' }, { ...config, search: (t) => ({ orderNumber: t }) });
    expect(args.where).toEqual({ AND: [{ orderNumber: 'SO-1' }] });
  });
});

describe('helpers', () => {
  it('nestPath builds nested objects', () => {
    expect(nestPath('a.b.c', 1)).toEqual({ a: { b: { c: 1 } } });
  });

  it('pageMeta computes total pages (min 1)', () => {
    expect(pageMeta(0, 1, 20)).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
    expect(pageMeta(41, 2, 20).totalPages).toBe(3);
  });

  it('queryBoolean and queryEnumList parse query strings', () => {
    const s = z.object({ active: queryBoolean, status: queryEnumList(['ACTIVE', 'ARCHIVED'] as const) });
    expect(s.parse({ active: 'false', status: 'ACTIVE,ARCHIVED' })).toEqual({ active: false, status: ['ACTIVE', 'ARCHIVED'] });
    expect(s.parse({ status: ['ARCHIVED'] }).status).toEqual(['ARCHIVED']);
    expect(s.safeParse({ status: 'DELETED' }).success).toBe(false);
    expect(s.safeParse({ active: 'yes' }).success).toBe(false);
  });

  it('dateRangeFilter builds gte/lt and is undefined when empty', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    expect(dateRangeFilter('createdAt')).toBeUndefined();
    expect(dateRangeFilter('createdAt', from)).toEqual({ createdAt: { gte: from } });
  });
});
