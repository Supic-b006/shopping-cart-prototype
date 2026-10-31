import type { PoolClient } from 'pg';
import { pool } from './pool.js';
import type { State, Cart, Order, User } from '../domain/types.js';
const changed = (a: unknown,b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
export async function transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // SRS serial processing; also covers multiple API processes sharing this DB.
    await db.query('SELECT pg_advisory_xact_lock(71002)');
    const result = await work(db); await db.query('COMMIT'); return result;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
async function load(db: PoolClient): Promise<State> {
  const products = (await db.query('SELECT id AS "productId", name, price, weight_gram AS "weightGram", stock, on_sale AS "isOnSale" FROM bean.products ORDER BY id')).rows;
  const coupons = (await db.query('SELECT code, percent, min_spend AS "minSpend", active FROM bean.coupons ORDER BY code')).rows;
  const carts: Cart[] = (await db.query('SELECT user_id AS "userId", stage, coupon_code AS "couponCode", current_order_id AS "currentOrderId" FROM bean.customer_carts ORDER BY user_id')).rows.map(c => ({...c,lines:[]}));
  const lines = (await db.query('SELECT user_id,product_id,quantity FROM bean.cart_items ORDER BY product_id')).rows;
  for (const line of lines) carts.find(c => c.userId === line.user_id)!.lines.push({productId:line.product_id,quantity:line.quantity});
  const orders: Order[] = (await db.query('SELECT * FROM bean.orders ORDER BY created_at,id')).rows.map(o => ({...o.snapshot,orderId:o.id,userId:o.user_id,status:o.status,createdAt:o.created_at.toISOString()}));
  return {products,coupons,carts,orders};
}
async function save(db: PoolClient, before: State, after: State) {
  for (const p of after.products) if (changed(p,before.products.find(x => x.productId === p.productId)))
    await db.query('UPDATE bean.products SET price=$2,stock=$3,on_sale=$4 WHERE id=$1',[p.productId,p.price,p.stock,p.isOnSale]);
  for (const c of after.coupons) if (changed(c,before.coupons.find(x => x.code === c.code)))
    await db.query('UPDATE bean.coupons SET active=$2 WHERE code=$1',[c.code,c.active]);
  for (const o of after.orders) {
    const old = before.orders.find(x => x.orderId === o.orderId);
    if (!old) {
      const {orderId,userId,status,createdAt,...snapshot} = o;
      await db.query('INSERT INTO bean.orders(id,user_id,status,created_at,snapshot) VALUES($1,$2,$3,$4,$5)',[orderId,userId,status,createdAt,JSON.stringify(snapshot)]);
    } else if (old.status !== o.status) await db.query('UPDATE bean.orders SET status=$2 WHERE id=$1',[o.orderId,o.status]);
  }
  for (const c of after.carts) {
    const old = before.carts.find(x => x.userId === c.userId)!;
    if (changed(c,old)) await db.query('UPDATE bean.customer_carts SET stage=$2,coupon_code=$3,current_order_id=$4 WHERE user_id=$1',[c.userId,c.stage,c.couponCode,c.currentOrderId]);
    if (changed(c.lines,old.lines)) {
      await db.query('DELETE FROM bean.cart_items WHERE user_id=$1',[c.userId]);
      for (const l of c.lines) await db.query('INSERT INTO bean.cart_items VALUES($1,$2,$3)',[c.userId,l.productId,l.quantity]);
    }
  }
}
export async function withState<T>(db: PoolClient, work: (state: State) => T): Promise<T> {
  const state = await load(db); const before = structuredClone(state);
  const result = work(state); await save(db,before,state); return result;
}
export function publicUser(row: Record<string,any>): User {
  return {id:row.id,username:row.username,role:row.role,memberTier:row.member_tier};
}
