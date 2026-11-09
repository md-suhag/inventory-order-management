import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * Local-disk storage for product images (TD-20). Only this module touches the filesystem, so an
 * S3-compatible backend can replace it later. Stored paths are relative and generated here
 * (random names), never derived from user input.
 */
const root = path.resolve(env.UPLOAD_DIR);

function resolveStored(relativePath: string): string {
  const full = path.resolve(root, relativePath);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid stored file path');
  return full;
}

export async function saveFile(data: Buffer, extension: string): Promise<string> {
  const relativePath = path.posix.join('products', `${randomUUID()}.${extension}`);
  const full = resolveStored(relativePath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data, { flag: 'wx' });
  return relativePath;
}

export function readStoredFile(relativePath: string): Promise<Buffer> {
  return readFile(resolveStored(relativePath));
}

/** Best effort: a missing or undeletable file is logged, never surfaced to the client. */
export async function removeStoredFiles(relativePaths: string[]): Promise<void> {
  await Promise.all(
    relativePaths.map(async (p) => {
      try {
        await rm(resolveStored(p), { force: true });
      } catch (err) {
        logger.warn({ err, path: p }, 'Failed to remove stored file');
      }
    }),
  );
}
