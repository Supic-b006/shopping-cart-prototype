import type { PoolClient } from "pg";
import { pool } from "./pool.js";
import type {
  State,
  Cart,
  Order,
  User,
} from "../domain/types.js";

const changed = (
  a: unknown,
  b: unknown,
): boolean => JSON.stringify(a) !== JSON.stringify(b);


export async function transaction<T>(
  work: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();

  let connectionError: Error | undefined;

  const handleClientError = (error: Error): void => {
    connectionError = error;

    console.error(
      "PostgreSQL client connection error:",
      error.message,
    );
  };

  db.on("error", handleClientError);

  try {
    await db.query("BEGIN");

    await db.query(
      "SELECT pg_advisory_xact_lock(71002)",
    );

    const result = await work(db);

    await db.query("COMMIT");

    return result;
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch (rollbackError) {

      connectionError =
        rollbackError instanceof Error
          ? rollbackError
          : new Error("Database rollback failed");

      console.error(
        "Database rollback failed:",
        connectionError.message,
      );
    }

    throw error;
  } finally {
    db.off("error", handleClientError);

    if (connectionError) {

      db.release(connectionError);
    } else {
      db.release();
    }
  }
}

async function load(
  db: PoolClient,
): Promise<State> {
  const products = (
    await db.query(`
      SELECT
        id AS "productId",
        name,
        price,
        weight_gram AS "weightGram",
        stock,
        on_sale AS "isOnSale"
      FROM bean.products
      ORDER BY id
    `)
  ).rows;

  const coupons = (
    await db.query(`
      SELECT
        code,
        percent,
        min_spend AS "minSpend",
        active
      FROM bean.coupons
      ORDER BY code
    `)
  ).rows;

  const carts: Cart[] = (
    await db.query(`
      SELECT
        user_id AS "userId",
        stage,
        coupon_code AS "couponCode",
        current_order_id AS "currentOrderId"
      FROM bean.customer_carts
      ORDER BY user_id
    `)
  ).rows.map((cart) => ({
    ...cart,
    lines: [],
  }));

  const lines = (
    await db.query(`
      SELECT
        user_id,
        product_id,
        quantity
      FROM bean.cart_items
      ORDER BY product_id
    `)
  ).rows;

  for (const line of lines) {
    const cart = carts.find(
      (item) => item.userId === line.user_id,
    );

    if (cart) {
      cart.lines.push({
        productId: line.product_id,
        quantity: line.quantity,
      });
    }
  }

  const orders: Order[] = (
    await db.query(`
      SELECT *
      FROM bean.orders
      ORDER BY created_at, id
    `)
  ).rows.map((order) => ({
    ...order.snapshot,
    orderId: order.id,
    userId: order.user_id,
    status: order.status,
    createdAt: order.created_at.toISOString(),
  }));

  return {
    products,
    coupons,
    carts,
    orders,
  };
}

async function save(
  db: PoolClient,
  before: State,
  after: State,
): Promise<void> {
  
  for (const product of after.products) {
    const oldProduct = before.products.find(
      (item) =>
        item.productId === product.productId,
    );

    if (changed(product, oldProduct)) {
      await db.query(
        `
          UPDATE bean.products
          SET
            price = $2,
            stock = $3,
            on_sale = $4
          WHERE id = $1
        `,
        [
          product.productId,
          product.price,
          product.stock,
          product.isOnSale,
        ],
      );
    }
  }

  for (const coupon of after.coupons) {
    const oldCoupon = before.coupons.find(
      (item) => item.code === coupon.code,
    );

    if (changed(coupon, oldCoupon)) {
      await db.query(
        `
          UPDATE bean.coupons
          SET active = $2
          WHERE code = $1
        `,
        [
          coupon.code,
          coupon.active,
        ],
      );
    }
  }

  
  for (const order of after.orders) {
    const oldOrder = before.orders.find(
      (item) => item.orderId === order.orderId,
    );

    if (!oldOrder) {
      const {
        orderId,
        userId,
        status,
        createdAt,
        ...snapshot
      } = order;

      await db.query(
        `
          INSERT INTO bean.orders(
            id,
            user_id,
            status,
            created_at,
            snapshot
          )
          VALUES($1, $2, $3, $4, $5)
        `,
        [
          orderId,
          userId,
          status,
          createdAt,
          JSON.stringify(snapshot),
        ],
      );
    } else if (oldOrder.status !== order.status) {
      await db.query(
        `
          UPDATE bean.orders
          SET status = $2
          WHERE id = $1
        `,
        [
          order.orderId,
          order.status,
        ],
      );
    }
  }

  
  for (const cart of after.carts) {
    const oldCart = before.carts.find(
      (item) => item.userId === cart.userId,
    );

    if (!oldCart) {
      continue;
    }

    if (changed(cart, oldCart)) {
      await db.query(
        `
          UPDATE bean.customer_carts
          SET
            stage = $2,
            coupon_code = $3,
            current_order_id = $4
          WHERE user_id = $1
        `,
        [
          cart.userId,
          cart.stage,
          cart.couponCode,
          cart.currentOrderId,
        ],
      );
    }

    if (changed(cart.lines, oldCart.lines)) {
      await db.query(
        `
          DELETE FROM bean.cart_items
          WHERE user_id = $1
        `,
        [cart.userId],
      );

      for (const line of cart.lines) {
        await db.query(
          `
            INSERT INTO bean.cart_items(
              user_id,
              product_id,
              quantity
            )
            VALUES($1, $2, $3)
          `,
          [
            cart.userId,
            line.productId,
            line.quantity,
          ],
        );
      }
    }
  }
}

export async function withState<T>(
  db: PoolClient,
  work: (state: State) => T,
): Promise<T> {
  const state = await load(db);
  const before = structuredClone(state);

  const result = work(state);

  await save(
    db,
    before,
    state,
  );

  return result;
}

export function publicUser(
  row: Record<string, any>,
): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    memberTier: row.member_tier,
  };
}