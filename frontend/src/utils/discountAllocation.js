/**
 * Invoice-level discount allocation — the single source of truth for spreading a
 * «خصم الفاتورة» across the invoice lines BEFORE profit / net-sale is computed.
 *
 * Rules (mirrored 1:1 on the backend in backend/src/utils/discountAllocation.js):
 *  - The invoice discount is distributed across lines in proportion to each
 *    line's value (its net amount after any per-line/item discount).
 *  - A single-line invoice therefore receives the whole invoice discount.
 *  - No line may be pushed below its own cost: each line can only absorb up to
 *    `value − cost` of discount (its "capacity"). The leftover that cannot be
 *    applied without selling at a loss is reported back so the UI can warn the
 *    cashier and the applied discount is capped at the safe maximum.
 *  - The minimum profit a line can reach because of the invoice discount is 0
 *    (never negative).
 *
 * @param {Array<{value:number, cost:number}>} lines
 *   value = line net sale amount AFTER the item-level discount, BEFORE interest.
 *   cost  = total cost of the line (per-unit cost × quantity).
 * @param {number} requestedDiscount the invoice discount the user asked for.
 * @returns {{allocations:number[], applied:number, unapplied:number, capped:boolean, totalCapacity:number}}
 */
const EPS = 1e-6;

/**
 * Clamp a single line's own discount («خصم المنتج») so the line can never be
 * sold below its cost. Operates on the per-unit amounts (quantity cancels out).
 * Runs BEFORE the invoice discount is distributed.
 *
 * @param {number} unitPrice per-unit sale price
 * @param {number} unitCost  per-unit cost
 * @param {number} requestedPerUnit per-unit discount the user asked for
 * @returns {{applied:number, unapplied:number, capped:boolean, max:number}}
 */
export function clampItemDiscountPerUnit(unitPrice, unitCost, requestedPerUnit) {
  const max = Math.max(0, (Number(unitPrice) || 0) - (Number(unitCost) || 0));
  const req = Math.max(0, Number(requestedPerUnit) || 0);
  const applied = Math.min(req, max);
  return { applied, unapplied: Math.max(0, req - applied), capped: req > applied + EPS, max };
}

export function allocateInvoiceDiscount(lines, requestedDiscount) {
  const req = Math.max(0, Number(requestedDiscount) || 0);
  const n = Array.isArray(lines) ? lines.length : 0;
  const allocations = new Array(n).fill(0);

  if (n === 0) {
    return { allocations, applied: 0, unapplied: req, capped: req > EPS, totalCapacity: 0 };
  }

  const value = lines.map((l) => Math.max(0, Number(l?.value) || 0));
  const capacity = lines.map((l, i) => Math.max(0, value[i] - (Number(l?.cost) || 0)));
  const totalCapacity = capacity.reduce((a, b) => a + b, 0);

  // Never apply more than the lines can safely absorb (keeps every line ≥ cost).
  const applied = Math.min(req, totalCapacity);

  // Water-fill: split the applied amount proportionally to line value among the
  // lines that still have room, cap each at its capacity, then redistribute the
  // remainder among the lines that are not yet saturated.
  const saturated = capacity.map((c) => c <= EPS);
  let remaining = applied;
  for (let guard = 0; guard <= n && remaining > EPS; guard++) {
    let activeBase = 0;
    for (let i = 0; i < n; i++) if (!saturated[i]) activeBase += value[i];
    if (activeBase <= EPS) break;

    const pool = remaining;
    let distributed = 0;
    let newlySaturated = false;
    for (let i = 0; i < n; i++) {
      if (saturated[i]) continue;
      let add = (pool * value[i]) / activeBase;
      const room = capacity[i] - allocations[i];
      if (add >= room - EPS) {
        add = room;
        saturated[i] = true;
        newlySaturated = true;
      }
      allocations[i] += add;
      distributed += add;
    }
    remaining -= distributed;
    if (!newlySaturated) {
      remaining = 0;
      break;
    }
  }

  const unapplied = Math.max(0, req - applied);
  return { allocations, applied, unapplied, capped: unapplied > EPS, totalCapacity };
}

export default { allocateInvoiceDiscount, clampItemDiscountPerUnit };
