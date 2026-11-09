import type { DocumentType } from '@prisma/client';
import type { Tx } from '../db/transaction';

/**
 * Allocates the next gap-free sequential document number (TD-14, BR-GEN-05)
 * for a given document type inside the caller's transaction.
 *
 * Atomically increments `next_number` with a row lock and returns the formatted
 * identifier, e.g. "PO-000001", "GRN-000001", "SO-000001", "INV-000001".
 */
export async function nextDocumentNumber(tx: Tx, documentType: DocumentType): Promise<string> {
  const [seq] = await tx.$queryRaw<{ prefix: string; current_number: number; padding: number }[]>`
    UPDATE document_sequences
    SET next_number = next_number + 1, updated_at = NOW()
    WHERE document_type = ${documentType}::"DocumentType"
    RETURNING prefix, next_number - 1 AS current_number, padding
  `;

  if (!seq) {
    throw new Error(`Document sequence for ${documentType} not found in database`);
  }

  const paddedNumber = String(seq.current_number).padStart(seq.padding, '0');
  return `${seq.prefix}-${paddedNumber}`;
}
