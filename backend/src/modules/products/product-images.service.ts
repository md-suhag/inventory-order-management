import type { RequestHandler } from 'express';
import multer from 'multer';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestContext } from '../../common/audit/audit';
import { withTransaction, type Tx } from '../../common/db/transaction';
import { AppError, ErrorCode, businessRule, notFound, validationError } from '../../common/errors/app-error';
import { readStoredFile, removeStoredFiles, saveFile } from './product-images.storage';

/** FR-PROD-07 / NFR-SEC-10 */
export const MAX_IMAGES_PER_PRODUCT = 5;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_FIELD = 'images';

const imageSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  sortOrder: true,
  createdAt: true,
} as const;

type ImageType = { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; extension: string };

/** Detects the real type from magic bytes; the client-supplied content type is ignored. */
export function detectImageType(data: Buffer): ImageType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (data.length >= 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_PRODUCT, fields: 0 },
}).array(IMAGE_FIELD, MAX_IMAGES_PER_PRODUCT);

/** Multipart parsing with multer errors mapped to the API error model. */
export const parseImageUpload: RequestHandler = (req, res, next) => {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, 'Each image must be at most 2 MB'));
      }
      return next(
        validationError([{ field: IMAGE_FIELD, message: `Send up to ${MAX_IMAGES_PER_PRODUCT} files in the "${IMAGE_FIELD}" field` }]),
      );
    }
    next(err);
  });
};

async function lockProduct(tx: Tx, productId: string): Promise<void> {
  const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
  if (!row) throw notFound('Product');
}

async function listImages(db: Tx | typeof prisma, productId: string) {
  return db.productImage.findMany({
    where: { productId },
    select: imageSelect,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function addImages(productId: string, files: Express.Multer.File[], ctx: RequestContext) {
  if (!files.length) throw validationError([{ field: IMAGE_FIELD, message: 'At least one image is required' }]);
  const detected = files.map((file, i) => {
    const type = detectImageType(file.buffer);
    if (!type) {
      throw validationError([{ field: `${IMAGE_FIELD}[${i}]`, message: 'Only JPEG, PNG or WebP images are allowed' }]);
    }
    return { file, type };
  });

  const stored: string[] = [];
  try {
    for (const { file, type } of detected) stored.push(await saveFile(file.buffer, type.extension));
    return await withTransaction(async (tx) => {
      await lockProduct(tx, productId);
      const existing = await tx.productImage.count({ where: { productId } });
      if (existing + files.length > MAX_IMAGES_PER_PRODUCT) {
        throw businessRule(`A product can have at most ${MAX_IMAGES_PER_PRODUCT} images (${existing} already uploaded)`);
      }
      await tx.productImage.createMany({
        data: detected.map(({ file, type }, i) => ({
          productId,
          filePath: stored[i]!,
          originalName: file.originalname.slice(0, 255),
          mimeType: type.mimeType,
          sizeBytes: file.size,
          sortOrder: existing + i,
        })),
      });
      await recordAudit(tx, ctx, {
        action: 'product.images_added',
        entityType: 'product',
        entityId: productId,
        metadata: { count: files.length },
      });
      return listImages(tx, productId);
    });
  } catch (err) {
    await removeStoredFiles(stored);
    throw err;
  }
}

/** Returns the bytes and stored metadata; the content type comes from the database, not the file. */
export async function getImageFile(productId: string, imageId: string) {
  const image = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
    select: { filePath: true, mimeType: true },
  });
  if (!image) throw notFound('Image');
  try {
    return { mimeType: image.mimeType, data: await readStoredFile(image.filePath) };
  } catch {
    throw notFound('Image');
  }
}

/** `imageIds` must list every image of the product exactly once; the first becomes primary. */
export function reorderImages(productId: string, imageIds: string[], ctx: RequestContext) {
  return withTransaction(async (tx) => {
    await lockProduct(tx, productId);
    const current = await tx.productImage.findMany({ where: { productId }, select: { id: true } });
    const currentIds = new Set(current.map((i) => i.id));
    if (imageIds.length !== currentIds.size || new Set(imageIds).size !== imageIds.length || !imageIds.every((id) => currentIds.has(id))) {
      throw validationError([{ field: 'imageIds', message: "Must list each of the product's images exactly once" }]);
    }
    for (const [index, id] of imageIds.entries()) {
      await tx.productImage.update({ where: { id }, data: { sortOrder: index } });
    }
    await recordAudit(tx, ctx, { action: 'product.images_reordered', entityType: 'product', entityId: productId });
    return listImages(tx, productId);
  });
}

export async function deleteImage(productId: string, imageId: string, ctx: RequestContext) {
  const removed = await withTransaction(async (tx) => {
    await lockProduct(tx, productId);
    const image = await tx.productImage.findFirst({ where: { id: imageId, productId }, select: { filePath: true } });
    if (!image) throw notFound('Image');
    await tx.productImage.delete({ where: { id: imageId } });
    const rest = await tx.productImage.findMany({
      where: { productId },
      select: { id: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    for (const [index, { id }] of rest.entries()) {
      await tx.productImage.update({ where: { id }, data: { sortOrder: index } });
    }
    await recordAudit(tx, ctx, {
      action: 'product.image_deleted',
      entityType: 'product',
      entityId: productId,
      metadata: { imageId },
    });
    return image.filePath;
  });
  await removeStoredFiles([removed]);
}
