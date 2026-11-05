import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataDir = path.join(root, '.pglite-integration');

if (!existsSync(dataDir)) {
  console.error('Local database not found. Run npm run db:migrate and npm run db:seed first.');
  process.exitCode = 1;
} else {
  const db = new PGlite(dataDir);
  try {
    await db.waitReady;
    const sections = [
      ['Products', 'SELECT id AS product_id, name, price, weight_gram, stock, on_sale FROM bean.products ORDER BY id'],
      ['Accounts (no password hashes)', 'SELECT id, username, role, member_tier FROM bean.accounts ORDER BY id'],
      ['Customer carts', 'SELECT user_id, stage, coupon_code, current_order_id FROM bean.customer_carts ORDER BY user_id'],
      ['Cart items', 'SELECT user_id, product_id, quantity FROM bean.cart_items ORDER BY user_id, product_id'],
      ['Orders', 'SELECT id AS order_id, user_id, status, created_at FROM bean.orders ORDER BY created_at DESC, id'],
    ];

    for (const [title, sql] of sections) {
      const result = await db.query(sql);
      console.log(`\n${title} (${result.rows.length})`);
      console.table(result.rows);
    }
  } finally {
    await db.close();
  }
}
