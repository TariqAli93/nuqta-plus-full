/**
 * Verify the realistic seed (scripts/seed-iraqi-market.mjs): integrity invariants
 * + a snapshot of the report dimensions the dataset is meant to exercise.
 *
 *   node scripts/verify-seed.mjs
 *
 * The three "mismatches should be 0" checks are the contract: product_stock must
 * equal the net of every stock movement, sale totals must equal their line items
 * (and paid+remaining), and each customer's cached debt must equal their open
 * sales. Anything non-zero means the seed drifted and must be fixed.
 */
import 'dotenv/config';
import { getPool, closeDatabase } from '../src/db.js';

const pool = await getPool();
const q = async (label, sql) => {
  const r = await pool.query(sql);
  console.log(`\n## ${label}`);
  console.table(r.rows);
};

try {
  await q('stock consistency (movements net vs product_stock; mismatches=0)', `
    WITH net AS (SELECT product_id, warehouse_id, SUM(quantity_change) qty FROM stock_movements GROUP BY 1,2)
    SELECT COUNT(*) FILTER (WHERE COALESCE(n.qty,0) <> ps.quantity) AS mismatches, COUNT(*) AS pairs
    FROM product_stock ps LEFT JOIN net n USING (product_id, warehouse_id)`);

  await q('sale totals vs line items (mismatches=0)', `
    WITH li AS (SELECT sale_id, SUM(subtotal) s FROM sale_items GROUP BY 1)
    SELECT COUNT(*) FILTER (WHERE ABS(s.subtotal - li.s) > 1) AS subtotal_mismatch,
           COUNT(*) FILTER (WHERE ABS(s.total - (s.paid_amount + s.remaining_amount)) > 1) AS paid_remaining_mismatch
    FROM sales s JOIN li ON li.sale_id = s.id`);

  await q('customer debt cache vs open sales (mismatches=0)', `
    WITH d AS (SELECT customer_id, SUM(remaining_amount) r FROM sales WHERE customer_id IS NOT NULL GROUP BY 1)
    SELECT COUNT(*) FILTER (WHERE ABS(c.total_debt - COALESCE(d.r,0)) > 1) AS mismatches
    FROM customers c LEFT JOIN d ON d.customer_id=c.id`);

  await q('sales spread over months', `
    SELECT to_char(created_at,'YYYY-MM') ym, COUNT(*) sales, ROUND(SUM(total)) revenue
    FROM sales GROUP BY 1 ORDER BY 1`);

  await q('top 5 best-selling products', `
    SELECT p.name, SUM(si.base_quantity) qty, ROUND(SUM(si.subtotal)) sales
    FROM sale_items si JOIN products p ON p.id=si.product_id GROUP BY p.name ORDER BY qty DESC LIMIT 5`);

  await q('stagnant products (zero sales)', `
    SELECT COUNT(*) stagnant FROM products p WHERE NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.product_id=p.id)`);

  await q('top 5 indebted customers', `
    SELECT name, customer_type, ROUND(total_debt) debt FROM customers WHERE total_debt>0 ORDER BY total_debt DESC LIMIT 5`);

  await q('top 5 suppliers we owe', `
    SELECT name, ROUND(total_debt) debt FROM suppliers WHERE total_debt>0 ORDER BY total_debt DESC LIMIT 5`);

  await q('monthly P&L (gross profit = revenue - COGS, vs expenses)', `
    WITH rev AS (
      SELECT to_char(s.created_at,'YYYY-MM') ym,
             SUM(si.subtotal) revenue,
             SUM(COALESCE(si.unit_cost_price,0)*si.base_quantity) cogs
      FROM sales s JOIN sale_items si ON si.sale_id=s.id GROUP BY 1),
    exp AS (SELECT to_char(expense_date::timestamp,'YYYY-MM') ym, SUM(amount) e FROM expenses GROUP BY 1)
    SELECT rev.ym, ROUND(rev.revenue-rev.cogs) gross_profit, ROUND(COALESCE(exp.e,0)) expenses,
           ROUND(rev.revenue-rev.cogs-COALESCE(exp.e,0)) net
    FROM rev LEFT JOIN exp USING (ym) ORDER BY 1`);
} finally {
  await closeDatabase().catch(() => {});
}
