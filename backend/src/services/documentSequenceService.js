import { sql } from 'drizzle-orm';
import { ValidationError } from '../utils/errors.js';

/**
 * Generic document numbering — the treasury/purchases/GL counterpart of
 * `allocateInvoiceNumber` in saleService (sales keep their dedicated
 * invoice_sequences table untouched).
 *
 * One counter row per (doc_type, branch, year) in `document_sequences`. The
 * atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING acquires a row-level
 * lock so concurrent LAN clients serialize, and a rolled-back transaction
 * never burns a number.
 */

/** Document types → human-stable number prefixes. */
export const DOC_TYPES = Object.freeze({
  purchase: 'PUR',
  purchase_return: 'PRT',
  voucher_receipt: 'RV', // سند قبض
  voucher_payment: 'PV', // سند صرف
  treasury_transfer: 'TT',
  journal: 'JE',
});

/**
 * Allocate the next number for `docType` within the caller's transaction.
 *
 * @param {object} tx Drizzle transaction handle
 * @param {{docType: string, branchId: number}} params
 * @returns {Promise<{number: string, sequence: number, year: number}>}
 *   number format: `<PREFIX><branch:3>-<year>-<seq:6>` e.g. RV001-2026-000042
 */
export async function allocateDocumentNumber(tx, { docType, branchId }) {
  const prefix = DOC_TYPES[docType];
  if (!prefix) {
    throw new ValidationError(`Unknown document type: ${docType}`);
  }
  if (!branchId || !Number.isInteger(Number(branchId)) || Number(branchId) <= 0) {
    throw new ValidationError('A branch is required to allocate a document number');
  }

  const year = new Date().getFullYear();

  const result = await tx.execute(sql`
    INSERT INTO document_sequences (doc_type, branch_id, year, next_value)
    VALUES (${docType}, ${Number(branchId)}, ${year}, 2)
    ON CONFLICT (doc_type, branch_id, year)
    DO UPDATE SET next_value = document_sequences.next_value + 1,
                  updated_at = now()
    RETURNING (next_value - 1) AS sequence
  `);

  const rows = result.rows ?? result;
  const seq = Number(rows?.[0]?.sequence);
  if (!Number.isFinite(seq) || seq <= 0) {
    throw new Error(`Document sequence allocation failed for ${docType}`);
  }

  const branchStr = String(branchId).padStart(3, '0');
  const seqStr = String(seq).padStart(6, '0');
  return {
    number: `${prefix}${branchStr}-${year}-${seqStr}`,
    sequence: seq,
    year,
  };
}

export default { DOC_TYPES, allocateDocumentNumber };
