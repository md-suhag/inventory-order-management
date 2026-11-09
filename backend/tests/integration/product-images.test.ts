import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

let manager: Session;
let productId: string;

const imagesUrl = () => `/api/v1/products/${productId}/images`;
const storedPath = (rel: string) => path.resolve(env.UPLOAD_DIR, rel);

beforeEach(async () => {
  await resetDatabase();
  manager = await loginAs('MANAGER');
  productId = (await prisma.product.create({ data: { sku: 'IMG-1', name: 'Pic', sellingPrice: '1' } })).id;
});

describe('product images (FR-PROD-07)', () => {
  it('uploads, detects type by magic bytes, serves with stored content type', async () => {
    const res = await api()
      .post(imagesUrl())
      .set(bearer(manager))
      .attach('images', PNG, { filename: 'front.png', contentType: 'image/png' })
      .attach('images', JPEG, { filename: 'side.bin', contentType: 'application/octet-stream' })
      .expect(201);
    expect(res.body.data).toMatchObject([
      { originalName: 'front.png', mimeType: 'image/png', sortOrder: 0, sizeBytes: PNG.length },
      { originalName: 'side.bin', mimeType: 'image/jpeg', sortOrder: 1 },
    ]);

    const rows = await prisma.productImage.findMany({ where: { productId } });
    for (const row of rows) {
      expect(row.filePath).toMatch(/^products\/[0-9a-f-]{36}\.(png|jpg)$/);
      expect(existsSync(storedPath(row.filePath))).toBe(true);
    }

    const staff = await loginAs('STAFF');
    const file = await api().get(`${imagesUrl()}/${res.body.data[0].id}`).set(bearer(staff)).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);

    const product = await api().get(`/api/v1/products/${productId}`).set(bearer(manager)).expect(200);
    expect(product.body.data.primaryImageId).toBe(res.body.data[0].id);
    expect(product.body.data.images).toHaveLength(2);
  });

  it('rejects disguised files, oversize files and more than 5 images', async () => {
    const fake = await api()
      .post(imagesUrl())
      .set(bearer(manager))
      .attach('images', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(422);

    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const tooBig = await api().post(imagesUrl()).set(bearer(manager)).attach('images', big, 'big.png');
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    let req = api().post(imagesUrl()).set(bearer(manager));
    for (let i = 0; i < 4; i += 1) req = req.attach('images', WEBP, `w${i}.webp`);
    await req.expect(201);
    const sixth = await api()
      .post(imagesUrl())
      .set(bearer(manager))
      .attach('images', PNG, 'a.png')
      .attach('images', PNG, 'b.png');
    expect(sixth.status).toBe(422);
    expect(sixth.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(await prisma.productImage.count({ where: { productId } })).toBe(4);

    const none = await api().post(imagesUrl()).set(bearer(manager)).field('x', '1');
    expect(none.status).toBe(422);
  });

  it('reorders (first = primary) and deletes with renumbering and file removal', async () => {
    const up = await api()
      .post(imagesUrl())
      .set(bearer(manager))
      .attach('images', PNG, 'a.png')
      .attach('images', JPEG, 'b.jpg')
      .attach('images', WEBP, 'c.webp')
      .expect(201);
    const [a, b, c] = up.body.data.map((i: { id: string }) => i.id) as [string, string, string];

    const bad = await api().put(`${imagesUrl()}/order`).set(bearer(manager)).send({ imageIds: [a, b] });
    expect(bad.status).toBe(422);
    const ordered = await api().put(`${imagesUrl()}/order`).set(bearer(manager)).send({ imageIds: [c, a, b] }).expect(200);
    expect(ordered.body.data.map((i: { id: string }) => i.id)).toEqual([c, a, b]);

    const fileOfA = (await prisma.productImage.findUniqueOrThrow({ where: { id: a } })).filePath;
    await api().delete(`${imagesUrl()}/${a}`).set(bearer(manager)).expect(204);
    expect(existsSync(storedPath(fileOfA))).toBe(false);
    const rest = await prisma.productImage.findMany({ where: { productId }, orderBy: { sortOrder: 'asc' } });
    expect(rest.map((i) => [i.id, i.sortOrder])).toEqual([
      [c, 0],
      [b, 1],
    ]);
    expect(await prisma.auditLog.count({ where: { entityId: productId, action: { startsWith: 'product.image' } } })).toBe(3);
  });

  it('deleting a product removes its image files', async () => {
    await api().post(imagesUrl()).set(bearer(manager)).attach('images', PNG, 'a.png').expect(201);
    const { filePath } = await prisma.productImage.findFirstOrThrow({ where: { productId } });
    await api().delete(`/api/v1/products/${productId}`).set(bearer(manager)).expect(204);
    expect(existsSync(storedPath(filePath))).toBe(false);
  });

  it('STAFF cannot upload', async () => {
    const staff = await loginAs('STAFF');
    const res = await api().post(imagesUrl()).set(bearer(staff)).attach('images', PNG, 'a.png');
    expect(res.status).toBe(403);
  });
});
