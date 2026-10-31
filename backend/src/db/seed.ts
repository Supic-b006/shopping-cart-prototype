import type { PoolClient } from 'pg';
import { passwordHash } from './security.js';
export async function seed(db: PoolClient, reset = false) {
  if (reset) await db.query('TRUNCATE bean.sessions,bean.cart_items,bean.customer_carts,bean.orders,bean.products,bean.coupons,bean.accounts');
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) throw new Error('SEED_PASSWORD must contain at least 8 characters');
  const accounts = [['cus_normal','Customer','normal'],['cus_prime','Customer','prime'],['admin01','Admin',null]];
  for (const [name,role,tier] of accounts) {
    await db.query('INSERT INTO bean.accounts VALUES($1,$1,$2,$3,$4) ON CONFLICT DO NOTHING',[name,passwordHash(password),role,tier]);
    if (role === 'Customer') await db.query("INSERT INTO bean.customer_carts(user_id,stage) VALUES($1,'cart') ON CONFLICT DO NOTHING",[name]);
  }
  const products = [['P1','Coffee Beans 250g',450,300,20],['P2','Drip Kettle',1200,900,3],['P3','Espresso Machine',15000,8000,5]];
  for (const p of products) await db.query('INSERT INTO bean.products VALUES($1,$2,$3,$4,$5,true) ON CONFLICT DO NOTHING',p);
  await db.query("INSERT INTO bean.coupons VALUES('SAVE10',10,1000,true) ON CONFLICT DO NOTHING");
}
