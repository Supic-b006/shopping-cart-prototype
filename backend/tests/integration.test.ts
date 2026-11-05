/**
 * Integration tests: HTTP (Express) -> domain service -> repository -> PostgreSQL.
 *
 * Runs only when RUN_DB_TESTS=true. It calls POST /api/testing/reset before EVERY test,
 * which TRUNCATEs all tables in schema `bean`, so point DATABASE_URL at a throw-away
 * test database, never at data you care about.
 *
 * Required env (backend/.env is loaded by vitest.config.ts):
 *   DATABASE_URL, SEED_PASSWORD, ALLOW_TEST_RESET=true, TEST_RESET_KEY (>= 24 chars)
 *   NODE_ENV=test (src/app.ts mounts the reset endpoint only in test mode).
 *
 * Expected values come from SRS-CART-002 v1.8 (seed data in section 7, rules in FR-4,
 * acceptance criteria AC-1..AC-19), calculated by hand and NOT by calling src/domain/pricing.ts.
 * Seed: P1 450฿/300g/stock 20, P2 1200฿/900g/stock 3, P3 15000฿/8000g/stock 5,
 *       SAVE10 = 10% with min spend 1000.
 * The "SRS acceptance criteria" block at the bottom maps one test to each AC for traceability.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';

const enabled = Boolean(process.env.DATABASE_URL && process.env.RUN_DB_TESTS === 'true');
const suite = enabled ? describe : describe.skip;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MISSING_ORDER = '00000000-0000-4000-8000-000000000000';

let server: Server;
let base = '';
let closePool: () => Promise<void> = async () => {};
let normal = '';
let prime = '';
let admin = '';

interface CallOptions { token?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> }

async function call(method: string, path: string, o: CallOptions = {}) {
  const headers: Record<string, string> = { ...o.headers };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  let body: string | undefined;
  if (o.body !== undefined) body = JSON.stringify(o.body);
  if (o.rawBody !== undefined) body = o.rawBody;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body });
  const json: any = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

const login = async (username: string) => {
  const r = await call('POST', '/api/auth/login', { body: { username, password: process.env.SEED_PASSWORD } });
  expect(r.status).toBe(200);
  return r.body.data.token as string;
};
const reset = () => call('POST', '/api/testing/reset', { headers: { 'X-Test-Reset-Key': process.env.TEST_RESET_KEY ?? '' } });

const add = (token: string, productId: string, quantity: unknown) => call('POST', '/api/cart/items', { token, body: { productId, quantity } });
const checkout = (token: string, zone: unknown = 'inCity', speed: unknown = 'standard') => call('POST', '/api/checkout', { token, body: { zone, speed } });
const bindCoupon = (token: string, code: unknown = 'SAVE10') => call('POST', '/api/cart/coupon', { token, body: { code } });
const pay = (orderId: string, outcome: 'success' | 'fail') => call('POST', `/api/gateway/orders/${orderId}/${outcome}`);
const getCart = async (token: string) => (await call('GET', '/api/cart', { token })).body.data;
const stockOf = async (productId: string) => (await call('GET', '/api/products', { token: admin })).body.data.find((p: any) => p.productId === productId).stock;

function expectError(res: { status: number; body: any }, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body.data).toBeUndefined();
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe('string');
  expect(res.body.error.details).toBeTypeOf('object');
}

suite('Integration: shopping cart API + PostgreSQL', () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run integration tests with NODE_ENV=production');
    // app.ts only mounts /api/testing/reset and the gateway when NODE_ENV === 'test'.
    if (process.env.NODE_ENV !== 'test')
      throw new Error(`NODE_ENV must be "test" to run integration tests (got "${process.env.NODE_ENV}"). Set NODE_ENV=test in backend/.env`);
    if (process.env.ALLOW_TEST_RESET !== 'true' || (process.env.TEST_RESET_KEY?.length ?? 0) < 24)
      throw new Error('Set ALLOW_TEST_RESET=true and TEST_RESET_KEY (>= 24 chars) in backend/.env to run integration tests');
    const { createApp } = await import('../src/app.js');
    const { pool } = await import('../src/db/pool.js');
    closePool = () => pool.end();
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', () => resolve()));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await closePool();
  });

  beforeEach(async () => {
    const r = await reset();
    expect(r.status).toBe(200);
    // Independent sessions: log in in parallel to save round trips to the remote database.
    [normal, prime, admin] = await Promise.all([login('cus_normal'), login('cus_prime'), login('admin01')]);
  });

  // ---------------------------------------------------------------- platform
  describe('platform', () => {
    it('reports health and test mode without authentication', async () => {
      const health = await call('GET', '/api/health');
      expect(health.status).toBe(200);
      expect(health.body.data.status).toBe('ok');
      const config = await call('GET', '/api/config');
      expect(config.status).toBe(200);
      expect(config.body.data.testMode).toBe(true);
    });

    it('returns ROUTE_NOT_FOUND for unknown routes', async () => {
      expectError(await call('GET', '/api/nope'), 404, 'ROUTE_NOT_FOUND');
    });

    it('rejects malformed JSON with VALIDATION_ERROR 400', async () => {
      expectError(await call('POST', '/api/auth/login', { rawBody: '{bad json' }), 400, 'VALIDATION_ERROR');
    });

    it('rejects bodies larger than 32KB with VALIDATION_ERROR 413', async () => {
      const huge = JSON.stringify({ username: 'x'.repeat(40_000), password: 'y' });
      expectError(await call('POST', '/api/auth/login', { rawBody: huge }), 413, 'VALIDATION_ERROR');
    });

    it('protects the reset endpoint with the secret key', async () => {
      const wrong = await call('POST', '/api/testing/reset', { headers: { 'X-Test-Reset-Key': 'x'.repeat(24) } });
      expectError(wrong, 403, 'AUTH_FORBIDDEN');
      expectError(await call('POST', '/api/testing/reset'), 403, 'AUTH_FORBIDDEN');
    });

    it('reset restores seed data and invalidates every session', async () => {
      await add(normal, 'P1', 2);
      await call('PATCH', '/api/admin/products/P1', { token: admin, body: { price: 999, stock: 7 } });
      expect((await reset()).status).toBe(200);
      expectError(await call('GET', '/api/cart', { token: normal }), 401, 'AUTH_REQUIRED');
      const fresh = await login('cus_normal');
      expect((await getCart(fresh)).lines).toEqual([]);
      const products = (await call('GET', '/api/products', { token: await login('admin01') })).body.data;
      expect(products.find((p: any) => p.productId === 'P1')).toMatchObject({ price: 450, stock: 20 });
    });
  });

  // -------------------------------------------------------------------- auth
  describe('authentication and roles', () => {
    it('logs in each seeded account with the right profile', async () => {
      const r = await call('POST', '/api/auth/login', { body: { username: 'cus_prime', password: process.env.SEED_PASSWORD } });
      expect(r.status).toBe(200);
      expect(r.body.data.token).toMatch(/^[a-f0-9]{64}$/);
      expect(r.body.data.user).toEqual({ id: 'cus_prime', username: 'cus_prime', role: 'Customer', memberTier: 'prime' });
      const a = await call('POST', '/api/auth/login', { body: { username: 'admin01', password: process.env.SEED_PASSWORD } });
      expect(a.body.data.user).toMatchObject({ role: 'Admin', memberTier: null });
    });

    it.each([
      ['wrong password', { username: 'cus_normal', password: 'definitely-wrong' }],
      ['unknown user', { username: 'nobody', password: 'whatever123' }],
    ])('rejects login with %s', async (_name, body) => {
      expectError(await call('POST', '/api/auth/login', { body }), 401, 'AUTH_INVALID_CREDENTIALS');
    });

    it.each([
      ['GET', '/api/auth/me'], ['GET', '/api/products'], ['GET', '/api/cart'], ['GET', '/api/orders'],
      ['GET', '/api/admin/coupons'], ['POST', '/api/checkout'],
    ])('requires a token for %s %s', async (method, path) => {
      expectError(await call(method, path), 401, 'AUTH_REQUIRED');
    });

    it('rejects malformed and unknown bearer tokens', async () => {
      expectError(await call('GET', '/api/cart', { token: 'short' }), 401, 'AUTH_REQUIRED');
      expectError(await call('GET', '/api/cart', { token: 'a'.repeat(64) }), 401, 'AUTH_REQUIRED');
    });

    it('/auth/me returns the cart for customers and null for admin', async () => {
      const c = await call('GET', '/api/auth/me', { token: prime });
      expect(c.body.data.user.username).toBe('cus_prime');
      expect(c.body.data.cart).toMatchObject({ userId: 'cus_prime', stage: 'cart', lines: [], subtotal: 0 });
      expect((await call('GET', '/api/auth/me', { token: admin })).body.data.cart).toBeNull();
    });

    it('logout deletes only the session that was sent', async () => {
      const second = await login('cus_prime');
      const out = await call('POST', '/api/auth/logout', { token: prime });
      expect(out.body.data).toEqual({ loggedOut: true });
      expectError(await call('GET', '/api/cart', { token: prime }), 401, 'AUTH_REQUIRED');
      expect((await call('GET', '/api/cart', { token: second })).status).toBe(200);
    });

    it('logging in again does not touch cart, stage or reserved stock', async () => {
      await add(prime, 'P1', 3); // 1,350฿ so SAVE10 (min 1,000฿) stays applied
      await bindCoupon(prime);
      const order = (await checkout(prime)).body.data.order;
      const again = await login('cus_prime');
      const cart = await getCart(again);
      expect(cart).toMatchObject({ stage: 'checkout', couponCode: 'SAVE10', currentOrderId: order.orderId });
      expect(cart.lines).toHaveLength(1);
      expect(await stockOf('P1')).toBe(17);
    });

    it('admin cannot use customer operations', async () => {
      expectError(await call('GET', '/api/cart', { token: admin }), 403, 'AUTH_FORBIDDEN');
      expectError(await add(admin, 'P1', 1), 403, 'AUTH_FORBIDDEN');
      expectError(await checkout(admin), 403, 'AUTH_FORBIDDEN');
      expectError(await call('GET', '/api/orders', { token: admin }), 403, 'AUTH_FORBIDDEN');
    });

    it('customers cannot use admin operations', async () => {
      expectError(await call('PATCH', '/api/admin/products/P1', { token: normal, body: { price: 1 } }), 403, 'AUTH_FORBIDDEN');
      expectError(await call('PATCH', '/api/admin/products/P1/status', { token: normal, body: { isOnSale: false } }), 403, 'AUTH_FORBIDDEN');
      expectError(await call('GET', '/api/admin/coupons', { token: normal }), 403, 'AUTH_FORBIDDEN');
      expectError(await call('PATCH', '/api/admin/coupons/SAVE10/status', { token: normal, body: { active: false } }), 403, 'AUTH_FORBIDDEN');
      expect(await stockOf('P1')).toBe(20);
    });
  });

  // ----------------------------------------------------------------- catalog
  describe('product catalog', () => {
    it('shows the three seeded products to a customer', async () => {
      const r = await call('GET', '/api/products', { token: normal });
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual([
        { productId: 'P1', name: 'Coffee Beans 250g', price: 450, weightGram: 300, stock: 20, isOnSale: true },
        { productId: 'P2', name: 'Drip Kettle', price: 1200, weightGram: 900, stock: 3, isOnSale: true },
        { productId: 'P3', name: 'Espresso Machine', price: 15000, weightGram: 8000, stock: 5, isOnSale: true },
      ]);
    });

    it('hides off-sale and zero-stock products from customers but not from admin', async () => {
      await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: false } });
      await call('PATCH', '/api/admin/products/P2', { token: admin, body: { stock: 0 } });
      const customer = (await call('GET', '/api/products', { token: normal })).body.data.map((p: any) => p.productId);
      expect(customer).toEqual(['P3']);
      const all = (await call('GET', '/api/products', { token: admin })).body.data;
      expect(all.map((p: any) => p.productId)).toEqual(['P1', 'P2', 'P3']);
      expect(all[0].isOnSale).toBe(false);
    });
  });

  // -------------------------------------------------------------------- cart
  describe('cart operations', () => {
    it('adds items, accumulates quantity and computes subtotal from current prices', async () => {
      await add(normal, 'P1', 2);
      const r = await add(normal, 'P1', 3);
      expect(r.status).toBe(200);
      expect(r.body.data.lines).toHaveLength(1);
      expect(r.body.data.lines[0]).toMatchObject({ productId: 'P1', quantity: 5, price: 450, available: true });
      expect(r.body.data.subtotal).toBe(2250);
      const two = (await add(normal, 'P2', 1)).body.data;
      expect(two.subtotal).toBe(3450);
    });

    it.each([
      ['quantity 0', 'P1', 0, 400, 'QTY_OUT_OF_RANGE'],
      ['quantity 11', 'P1', 11, 400, 'QTY_OUT_OF_RANGE'],
      ['quantity as string', 'P1', '2', 400, 'VALIDATION_ERROR'],
      ['fractional quantity', 'P1', 1.5, 400, 'VALIDATION_ERROR'],
      ['missing quantity', 'P1', undefined, 400, 'VALIDATION_ERROR'],
      ['unknown product', 'P99', 1, 404, 'PRODUCT_NOT_FOUND'],
      ['quantity range before product existence', 'P99', 0, 400, 'QTY_OUT_OF_RANGE'],
      ['more than stock', 'P2', 4, 409, 'INSUFFICIENT_STOCK'],
    ])('rejects add with %s without changing the cart', async (_name, productId, quantity, status, code) => {
      expectError(await add(normal, productId, quantity), status, code);
      expect((await getCart(normal)).lines).toEqual([]);
    });

    it('rejects an accumulated quantity above 10 and keeps the old quantity', async () => {
      await add(normal, 'P1', 6);
      expectError(await add(normal, 'P1', 5), 400, 'QTY_OUT_OF_RANGE');
      expect((await getCart(normal)).lines[0].quantity).toBe(6);
    });

    it('rejects an off-sale product with PRODUCT_UNAVAILABLE', async () => {
      await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: false } });
      expectError(await add(normal, 'P1', 1), 409, 'PRODUCT_UNAVAILABLE');
    });

    it('PATCH replaces the quantity and enforces the same rules', async () => {
      await add(normal, 'P2', 1);
      const ok = await call('PATCH', '/api/cart/items/P2', { token: normal, body: { quantity: 3 } });
      expect(ok.body.data.lines[0].quantity).toBe(3);
      expect(ok.body.data.subtotal).toBe(3600);
      expectError(await call('PATCH', '/api/cart/items/P2', { token: normal, body: { quantity: 4 } }), 409, 'INSUFFICIENT_STOCK');
      expectError(await call('PATCH', '/api/cart/items/P2', { token: normal, body: { quantity: 0 } }), 400, 'QTY_OUT_OF_RANGE');
      expectError(await call('PATCH', '/api/cart/items/P1', { token: normal, body: { quantity: 1 } }), 409, 'ITEM_NOT_IN_CART');
      expect((await getCart(normal)).lines[0].quantity).toBe(3);
    });

    it('removes lines and reports an empty cart', async () => {
      await add(normal, 'P1', 1);
      await add(normal, 'P2', 1);
      const first = await call('DELETE', '/api/cart/items/P1', { token: normal });
      expect(first.status).toBe(200);
      expect(first.body.data.messages).toEqual([]);
      expect(first.body.data.cart.lines.map((l: any) => l.productId)).toEqual(['P2']);
      const last = await call('DELETE', '/api/cart/items/P2', { token: normal });
      expect(last.body.data.cart.lines).toEqual([]);
      expect(last.body.data.messages).toHaveLength(1);
      expect(last.body.data.messages[0]).toMatchObject({ kind: 'info', code: '' });
    });

    it('rejects removing from an empty cart or a missing line', async () => {
      expectError(await call('DELETE', '/api/cart/items/P1', { token: normal }), 409, 'CART_EMPTY');
      await add(normal, 'P2', 1);
      expectError(await call('DELETE', '/api/cart/items/P1', { token: normal }), 409, 'ITEM_NOT_IN_CART');
    });

    it('carts are private to each customer', async () => {
      await add(normal, 'P1', 2);
      expect((await getCart(prime)).lines).toEqual([]);
      expect((await getCart(normal)).lines).toHaveLength(1);
    });

    it('cart always reflects the latest price and availability set by admin', async () => {
      await add(normal, 'P1', 2);
      await call('PATCH', '/api/admin/products/P1', { token: admin, body: { price: 500 } });
      let cart = await getCart(normal);
      expect(cart.subtotal).toBe(1000);
      expect(cart.lines[0].available).toBe(true);
      await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: false } });
      cart = await getCart(normal);
      expect(cart.lines[0].available).toBe(false);
      expect(cart.lines[0].quantity).toBe(2);
    });
  });

  // ----------------------------------------------------------------- coupons
  describe('coupons', () => {
    it('binds a valid coupon even to an empty cart', async () => {
      const r = await bindCoupon(normal);
      expect(r.status).toBe(200);
      expect(r.body.data.couponCode).toBe('SAVE10');
      expect(r.body.data.subtotal).toBe(0);
    });

    it.each([['lower case', 'save10'], ['unknown code', 'FREE100'], ['empty string', ''], ['trailing space', 'SAVE10 ']])(
      'rejects %s with COUPON_INVALID and leaves the cart unchanged', async (_name, code) => {
        expectError(await bindCoupon(normal, code), 409, 'COUPON_INVALID');
        expect((await getCart(normal)).couponCode).toBeNull();
      });

    it('admin lists and toggles coupons; an inactive coupon cannot be bound', async () => {
      const list = await call('GET', '/api/admin/coupons', { token: admin });
      expect(list.body.data).toEqual([{ code: 'SAVE10', percent: 10, minSpend: 1000, active: true }]);
      const off = await call('PATCH', '/api/admin/coupons/SAVE10/status', { token: admin, body: { active: false } });
      expect(off.body.data).toMatchObject({ code: 'SAVE10', active: false });
      expectError(await bindCoupon(normal), 409, 'COUPON_INVALID');
      await call('PATCH', '/api/admin/coupons/SAVE10/status', { token: admin, body: { active: true } });
      expect((await bindCoupon(normal)).status).toBe(200);
    });

    it('validates coupon status updates', async () => {
      const bad = await call('PATCH', '/api/admin/coupons/SAVE10/status', { token: admin, body: { active: 'false' } });
      expectError(bad, 400, 'VALIDATION_ERROR');
      expect(bad.body.error.details).toEqual({ fields: ['active'] });
      expectError(await call('PATCH', '/api/admin/coupons/NOPE/status', { token: admin, body: { active: false } }), 404, 'COUPON_NOT_FOUND');
    });

    it('an already-bound coupon that was deactivated is dropped at checkout with a notice', async () => {
      await add(prime, 'P1', 3); // subtotal 1350, would qualify for SAVE10
      await bindCoupon(prime);
      await call('PATCH', '/api/admin/coupons/SAVE10/status', { token: admin, body: { active: false } });
      const r = await checkout(prime);
      expect(r.status).toBe(201);
      expect(r.body.data.messages[0]).toMatchObject({ kind: 'notice', code: 'COUPON_NOT_APPLICABLE' });
      // prime member discount applies instead: floor(1350 * 5 / 100) = 67
      expect(r.body.data.order).toMatchObject({ discount: 67, discountSource: 'member', couponCode: null });
    });
  });

  // -------------------------------------------------------- checkout pricing
  describe('checkout pricing (hand-calculated from the SRS)', () => {
    interface Case {
      name: string; user: 'normal' | 'prime'; items: [string, number][]; coupon: boolean; zone: string; speed: string;
      subtotal: number; weight: number; discount: number; source: string; fee: number; net: number;
    }
    const cases: Case[] = [
      { name: 'AC-4 prime + SAVE10, medium, inCity standard (free shipping)', user: 'prime', items: [['P1', 1], ['P2', 1]], coupon: true, zone: 'inCity', speed: 'standard', subtotal: 1650, weight: 1200, discount: 165, source: 'coupon', fee: 0, net: 1485 },
      { name: 'AC-5 prime without coupon gets 5% member discount (floored)', user: 'prime', items: [['P1', 1], ['P2', 1]], coupon: false, zone: 'inCity', speed: 'standard', subtotal: 1650, weight: 1200, discount: 82, source: 'member', fee: 0, net: 1568 },
      { name: 'normal, light, inCity standard', user: 'normal', items: [['P1', 1]], coupon: false, zone: 'inCity', speed: 'standard', subtotal: 450, weight: 300, discount: 0, source: 'none', fee: 30, net: 480 },
      { name: 'normal, light, inCity express (x1.5)', user: 'normal', items: [['P1', 1]], coupon: false, zone: 'inCity', speed: 'express', subtotal: 450, weight: 300, discount: 0, source: 'none', fee: 45, net: 495 },
      { name: 'normal, light, remote express', user: 'normal', items: [['P1', 1]], coupon: false, zone: 'remote', speed: 'express', subtotal: 450, weight: 300, discount: 0, source: 'none', fee: 120, net: 570 },
      { name: 'prime, light, upcountry express (x0.5, floors member discount 22.5)', user: 'prime', items: [['P1', 1]], coupon: false, zone: 'upcountry', speed: 'express', subtotal: 450, weight: 300, discount: 22, source: 'member', fee: 25, net: 453 },
      { name: 'light tier upper side: 900g', user: 'normal', items: [['P1', 3]], coupon: false, zone: 'inCity', speed: 'standard', subtotal: 1350, weight: 900, discount: 0, source: 'none', fee: 30, net: 1380 },
      { name: 'medium tier: 1200g', user: 'normal', items: [['P1', 4]], coupon: false, zone: 'inCity', speed: 'standard', subtotal: 1800, weight: 1200, discount: 0, source: 'none', fee: 50, net: 1850 },
      { name: 'normal, heavy 8000g, standard', user: 'normal', items: [['P3', 1]], coupon: false, zone: 'inCity', speed: 'standard', subtotal: 15000, weight: 8000, discount: 0, source: 'none', fee: 80, net: 15080 },
      { name: 'normal, heavy with SAVE10', user: 'normal', items: [['P3', 1]], coupon: true, zone: 'inCity', speed: 'standard', subtotal: 15000, weight: 8000, discount: 1500, source: 'coupon', fee: 80, net: 13580 },
      { name: 'normal, two machines (16000g, still allowed)', user: 'normal', items: [['P3', 2]], coupon: false, zone: 'inCity', speed: 'standard', subtotal: 30000, weight: 16000, discount: 0, source: 'none', fee: 80, net: 30080 },
      { name: 'prime, heavy remote express', user: 'prime', items: [['P3', 1]], coupon: false, zone: 'remote', speed: 'express', subtotal: 15000, weight: 8000, discount: 750, source: 'member', fee: 90, net: 14340 },
      { name: 'AC-8 normal, heavy remote express (180 x 3/2)', user: 'normal', items: [['P3', 1]], coupon: false, zone: 'remote', speed: 'express', subtotal: 15000, weight: 8000, discount: 0, source: 'none', fee: 270, net: 15270 },
      // weight tier boundaries reachable with the seed products (weights are 300 / 900 / 8000 g)
      { name: 'medium tier upper side: 4,800g', user: 'normal', items: [['P1', 10], ['P2', 2]], coupon: false, zone: 'inCity', speed: 'standard', subtotal: 6900, weight: 4800, discount: 0, source: 'none', fee: 50, net: 6950 },
      { name: 'heavy tier lower side: 5,700g', user: 'normal', items: [['P1', 10], ['P2', 3]], coupon: false, zone: 'inCity', speed: 'standard', subtotal: 8100, weight: 5700, discount: 0, source: 'none', fee: 80, net: 8180 },
      { name: 'just under the weight limit: 19,900g is accepted', user: 'normal', items: [['P3', 2], ['P1', 10], ['P2', 1]], coupon: false, zone: 'inCity', speed: 'standard', subtotal: 35700, weight: 19900, discount: 0, source: 'none', fee: 80, net: 35780 },
    ];

    it.each(cases)('$name', async c => {
      const token = c.user === 'prime' ? prime : normal;
      for (const [id, qty] of c.items) expect((await add(token, id, qty)).status).toBe(200);
      if (c.coupon) await bindCoupon(token);
      const r = await checkout(token, c.zone, c.speed);
      expect(r.status).toBe(201);
      expect(r.body.data.messages).toEqual([]);
      const o = r.body.data.order;
      expect(o.orderId).toMatch(UUID);
      expect(o).toMatchObject({
        userId: c.user === 'prime' ? 'cus_prime' : 'cus_normal', status: 'pending', zone: c.zone, speed: c.speed,
        subtotal: c.subtotal, totalWeightGram: c.weight, discount: c.discount, discountSource: c.source,
        shippingFee: c.fee, netTotal: c.net, couponCode: c.coupon ? 'SAVE10' : null,
      });
      expect(new Date(o.createdAt).toString()).not.toBe('Invalid Date');
      expect(o.lines).toHaveLength(c.items.length);
      // stage moves to checkout and stock is reserved
      const cart = await getCart(token);
      expect(cart).toMatchObject({ stage: 'checkout', currentOrderId: o.orderId });
      for (const [id, qty] of c.items) expect(await stockOf(id)).toBe({ P1: 20, P2: 3, P3: 5 }[id as 'P1'] - qty);
      // the order can be read back unchanged
      const again = await call('GET', `/api/orders/${o.orderId}`, { token });
      expect(again.body.data).toEqual(o);
    });

    it('drops a coupon below the minimum spend and prices the order without it (normal member)', async () => {
      await add(normal, 'P1', 1); // 450 < 1000
      await bindCoupon(normal);
      const r = await checkout(normal);
      expect(r.status).toBe(201);
      expect(r.body.data.messages).toEqual([expect.objectContaining({ kind: 'notice', code: 'COUPON_NOT_APPLICABLE' })]);
      expect(r.body.data.order).toMatchObject({ discount: 0, discountSource: 'none', shippingFee: 30, netTotal: 480, couponCode: null });
      expect((await getCart(normal)).couponCode).toBeNull();
    });

    it('drops a coupon below the minimum spend and falls back to the prime discount', async () => {
      await add(prime, 'P1', 1);
      await bindCoupon(prime);
      const r = await checkout(prime);
      expect(r.body.data.messages[0].code).toBe('COUPON_NOT_APPLICABLE');
      // floor(450 * 5 / 100) = 22; light inCity standard is free for prime
      expect(r.body.data.order).toMatchObject({ discount: 22, discountSource: 'member', shippingFee: 0, netTotal: 428, couponCode: null });
    });
  });

  // ---------------------------------------------------------- checkout errors
  describe('checkout validation', () => {
    it.each([
      ['unknown zone', 'abroad', 'standard'],
      ['unknown speed', 'inCity', 'overnight'],
      ['missing zone', undefined, 'standard'],
      ['missing speed', 'inCity', undefined],
    ])('rejects %s with VALIDATION_ERROR before looking at the cart', async (_name, zone, speed) => {
      // cart is empty on purpose: zone/speed are validated first.
      // Build the body by hand: the checkout() helper would replace `undefined` with its default value.
      const body: Record<string, unknown> = {};
      if (zone !== undefined) body.zone = zone;
      if (speed !== undefined) body.speed = speed;
      expectError(await call('POST', '/api/checkout', { token: normal, body }), 400, 'VALIDATION_ERROR');
    });

    it('rejects an empty cart with CART_EMPTY', async () => {
      expectError(await checkout(normal), 409, 'CART_EMPTY');
    });

    it('lists every unavailable line in ITEMS_UNAVAILABLE', async () => {
      await add(normal, 'P1', 1);
      await add(normal, 'P2', 2);
      await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: false } });
      await call('PATCH', '/api/admin/products/P2', { token: admin, body: { stock: 1 } }); // < quantity in cart
      const r = await checkout(normal);
      expectError(r, 409, 'ITEMS_UNAVAILABLE');
      expect(new Set(r.body.error.details.productIds)).toEqual(new Set(['P1', 'P2']));
    });

    it('rejects total weight above 20,000g', async () => {
      await add(normal, 'P3', 3); // 24,000g
      expectError(await checkout(normal), 409, 'WEIGHT_LIMIT_EXCEEDED');
    });

    it('rejects 20,800g (smallest overweight combination near the limit)', async () => {
      await add(normal, 'P3', 2); await add(normal, 'P1', 10); await add(normal, 'P2', 2); // 16,000 + 3,000 + 1,800
      expectError(await checkout(normal), 409, 'WEIGHT_LIMIT_EXCEEDED');
    });

    it('reports ITEMS_UNAVAILABLE before WEIGHT_LIMIT_EXCEEDED (FR-5.2.1 order)', async () => {
      await add(normal, 'P3', 3); // overweight
      await add(normal, 'P1', 1);
      await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: false } });
      const r = await checkout(normal);
      expectError(r, 409, 'ITEMS_UNAVAILABLE');
      expect(r.body.error.details.productIds).toEqual(['P1']);
    });

    it('a failed checkout reserves nothing, keeps the coupon and creates no order', async () => {
      await add(normal, 'P3', 3);
      await bindCoupon(normal);
      expectError(await checkout(normal), 409, 'WEIGHT_LIMIT_EXCEEDED');
      expect(await getCart(normal)).toMatchObject({ stage: 'cart', couponCode: 'SAVE10', currentOrderId: null });
      expect(await stockOf('P3')).toBe(5);
      expect((await call('GET', '/api/orders', { token: normal })).body.data).toEqual([]);
    });
  });

  // ---------------------------------------------------------------- lifecycle
  describe('payment, cancel and stage rules', () => {
    async function pending(token = prime) {
      await add(token, 'P1', 1);
      await add(token, 'P2', 1);
      await bindCoupon(token);
      return (await checkout(token)).body.data.order;
    }

    it('successful payment completes the AC-4 flow end to end', async () => {
      const order = await pending();
      expect(order.netTotal).toBe(1485);
      const paid = await pay(order.orderId, 'success');
      expect(paid.status).toBe(200);
      expect(paid.body.data.order.status).toBe('paid');
      expect(paid.body.data.messages).toEqual([]);
      const cart = await getCart(prime);
      expect(cart).toMatchObject({ stage: 'success', couponCode: null, lines: [], subtotal: 0 });
      expect(await stockOf('P1')).toBe(19); // deducted once at checkout, not again at payment
      expect(await stockOf('P2')).toBe(2);
      const stored = await call('GET', `/api/orders/${order.orderId}`, { token: prime });
      expect(stored.body.data.status).toBe('paid');
    });

    it('a failed payment changes nothing and can be retried', async () => {
      const order = await pending();
      const failed = await pay(order.orderId, 'fail');
      expect(failed.status).toBe(200);
      expect(failed.body.data.messages).toHaveLength(1);
      expect(failed.body.data.messages[0]).toMatchObject({ kind: 'info', code: '' });
      expect(failed.body.data.order.status).toBe('pending');
      expect(await getCart(prime)).toMatchObject({ stage: 'checkout', currentOrderId: order.orderId });
      expect(await stockOf('P1')).toBe(19);
      expect((await pay(order.orderId, 'success')).body.data.order.status).toBe('paid');
    });

    it('cancel releases the reservation but keeps cart lines and coupon', async () => {
      await pending();
      const r = await call('POST', '/api/checkout/cancel', { token: prime });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ stage: 'cart', couponCode: 'SAVE10', currentOrderId: null, subtotal: 1650 });
      expect(r.body.data.lines).toHaveLength(2);
      expect(await stockOf('P1')).toBe(20);
      expect(await stockOf('P2')).toBe(3);
      const orders = (await call('GET', '/api/orders', { token: prime })).body.data;
      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe('cancelled');
    });

    it('continue-shopping after success returns to an empty cart stage', async () => {
      const order = await pending();
      await pay(order.orderId, 'success');
      const r = await call('POST', '/api/continue-shopping', { token: prime });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ stage: 'cart', currentOrderId: null, lines: [] });
      expect((await add(prime, 'P1', 1)).status).toBe(200);
    });

    it('blocks cart mutations and repeated checkout while waiting for payment', async () => {
      await pending();
      const blocked: [string, string, unknown?][] = [
        ['POST', '/api/cart/items', { productId: 'P1', quantity: 1 }],
        ['PATCH', '/api/cart/items/P1', { quantity: 2 }],
        ['DELETE', '/api/cart/items/P1'],
        ['POST', '/api/cart/coupon', { code: 'SAVE10' }],
        ['POST', '/api/checkout', { zone: 'inCity', speed: 'standard' }],
        ['POST', '/api/continue-shopping'],
      ];
      for (const [method, path, body] of blocked)
        expectError(await call(method, path, { token: prime, body }), 409, 'OPERATION_NOT_ALLOWED');
      expect((await call('GET', '/api/cart', { token: prime })).status).toBe(200);
      expect((await call('GET', '/api/orders', { token: prime })).status).toBe(200);
      expect(await stockOf('P1')).toBe(19);
    });

    it('blocks cancel and continue-shopping while in the cart stage', async () => {
      expectError(await call('POST', '/api/checkout/cancel', { token: normal }), 409, 'OPERATION_NOT_ALLOWED');
      expectError(await call('POST', '/api/continue-shopping', { token: normal }), 409, 'OPERATION_NOT_ALLOWED');
    });

    it('blocks edits, checkout and cancel on the success page', async () => {
      const order = await pending();
      await pay(order.orderId, 'success');
      expectError(await add(prime, 'P1', 1), 409, 'OPERATION_NOT_ALLOWED');
      expectError(await checkout(prime), 409, 'OPERATION_NOT_ALLOWED');
      expectError(await call('POST', '/api/checkout/cancel', { token: prime }), 409, 'OPERATION_NOT_ALLOWED');
      expect((await call('GET', `/api/orders/${order.orderId}`, { token: prime })).status).toBe(200);
    });

    it('simulated gateway rejects unknown, duplicate and stale payments', async () => {
      expectError(await pay(MISSING_ORDER, 'success'), 404, 'ORDER_NOT_FOUND');
      const first = await pending();
      await pay(first.orderId, 'success');
      expectError(await pay(first.orderId, 'success'), 409, 'OPERATION_NOT_ALLOWED');
      expectError(await pay(first.orderId, 'fail'), 409, 'OPERATION_NOT_ALLOWED');

      await call('POST', '/api/continue-shopping', { token: prime });
      const second = await pending();
      await call('POST', '/api/checkout/cancel', { token: prime });
      expectError(await pay(second.orderId, 'success'), 409, 'OPERATION_NOT_ALLOWED');
      expect((await call('GET', `/api/orders/${second.orderId}`, { token: prime })).body.data.status).toBe('cancelled');
    });

    it('lists orders newest first', async () => {
      const first = await pending();
      await pay(first.orderId, 'success');
      await call('POST', '/api/continue-shopping', { token: prime });
      await add(prime, 'P1', 2);
      const second = (await checkout(prime)).body.data.order;
      const list = (await call('GET', '/api/orders', { token: prime })).body.data;
      expect(list.map((o: any) => o.orderId)).toEqual([second.orderId, first.orderId]);
      expect(list.map((o: any) => o.status)).toEqual(['pending', 'paid']);
    });
  });

  // -------------------------------------------------------- cross-user effects
  describe('multi-user behaviour', () => {
    it('reserved stock is invisible to other customers until it is released', async () => {
      await add(prime, 'P2', 3); // all of P2
      const order = (await checkout(prime)).body.data.order;
      expect(await stockOf('P2')).toBe(0);
      expect((await call('GET', '/api/products', { token: normal })).body.data.map((p: any) => p.productId)).toEqual(['P1', 'P3']);
      expectError(await add(normal, 'P2', 1), 409, 'PRODUCT_UNAVAILABLE');
      await call('POST', '/api/checkout/cancel', { token: prime });
      expect(await stockOf('P2')).toBe(3);
      expect((await add(normal, 'P2', 1)).status).toBe(200);
      expect(order.orderId).toMatch(UUID);
    });

    it('the second shopper cannot take stock the first one reserved', async () => {
      await add(normal, 'P2', 2);
      await add(prime, 'P2', 2);
      expect((await checkout(normal)).status).toBe(201); // stock 3 -> 1
      expectError(await checkout(prime), 409, 'ITEMS_UNAVAILABLE');
      expect(await stockOf('P2')).toBe(1);
    });

    it('customers can only read their own orders', async () => {
      await add(prime, 'P1', 1);
      const order = (await checkout(prime)).body.data.order;
      expect((await call('GET', '/api/orders', { token: normal })).body.data).toEqual([]);
      expectError(await call('GET', `/api/orders/${order.orderId}`, { token: normal }), 404, 'ORDER_NOT_FOUND');
      expectError(await call('GET', `/api/orders/${MISSING_ORDER}`, { token: normal }), 404, 'ORDER_NOT_FOUND');
      expectError(await call('GET', '/api/orders/not-a-uuid', { token: normal }), 404, 'ORDER_NOT_FOUND');
    });

    it('an order keeps its price snapshot when admin later changes the price', async () => {
      await add(normal, 'P1', 2);
      const order = (await checkout(normal)).body.data.order;
      await call('PATCH', '/api/admin/products/P1', { token: admin, body: { price: 999 } });
      const stored = (await call('GET', `/api/orders/${order.orderId}`, { token: normal })).body.data;
      expect(stored.subtotal).toBe(900);
      expect(stored.lines[0]).toMatchObject({ productId: 'P1', price: 450, quantity: 2 });
      await call('POST', '/api/checkout/cancel', { token: normal });
      expect((await getCart(normal)).subtotal).toBe(1998); // cart is re-priced, order was not
    });

    it('cancelling after admin changed stock adds the quantity to the current stock', async () => {
      await add(normal, 'P1', 4);
      await checkout(normal); // stock 16
      await call('PATCH', '/api/admin/products/P1', { token: admin, body: { stock: 5 } });
      await call('POST', '/api/checkout/cancel', { token: normal });
      expect(await stockOf('P1')).toBe(9);
    });
  });

  // ------------------------------------------------------------ admin products
  describe('admin product management', () => {
    it('updates price and stock and returns the product', async () => {
      const r = await call('PATCH', '/api/admin/products/P1', { token: admin, body: { price: 500, stock: 10 } });
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual({ productId: 'P1', name: 'Coffee Beans 250g', price: 500, weightGram: 300, stock: 10, isOnSale: true });
      const onlyPrice = await call('PATCH', '/api/admin/products/P1', { token: admin, body: { price: 600 } });
      expect(onlyPrice.body.data).toMatchObject({ price: 600, stock: 10 });
    });

    it.each([
      ['price 0', { price: 0 }, ['price']],
      ['price 50001', { price: 50001 }, ['price']],
      ['price as string', { price: '100' }, ['price']],
      ['fractional price', { price: 99.5 }, ['price']],
      ['negative stock', { stock: -1 }, ['stock']],
      ['stock 10000', { stock: 10000 }, ['stock']],
      ['both invalid', { price: 0, stock: 10000 }, ['price', 'stock']],
      ['empty body', {}, ['price', 'stock']],
    ])('rejects %s and lists the failing fields', async (_name, body, fields) => {
      const r = await call('PATCH', '/api/admin/products/P1', { token: admin, body });
      expectError(r, 400, 'VALIDATION_ERROR');
      expect(r.body.error.details).toEqual({ fields });
      expect(await stockOf('P1')).toBe(20);
    });

    it('accepts boundary values', async () => {
      const r = await call('PATCH', '/api/admin/products/P1', { token: admin, body: { price: 50000, stock: 0 } });
      expect(r.body.data).toMatchObject({ price: 50000, stock: 0 });
      const r2 = await call('PATCH', '/api/admin/products/P1', { token: admin, body: { price: 1, stock: 9999 } });
      expect(r2.body.data).toMatchObject({ price: 1, stock: 9999 });
    });

    it('checks that the product exists before validating fields', async () => {
      expectError(await call('PATCH', '/api/admin/products/P99', { token: admin, body: { price: 0 } }), 404, 'PRODUCT_NOT_FOUND');
      expectError(await call('PATCH', '/api/admin/products/P99/status', { token: admin, body: { isOnSale: false } }), 404, 'PRODUCT_NOT_FOUND');
    });

    it('validates and applies sale status', async () => {
      const bad = await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: 'false' } });
      expectError(bad, 400, 'VALIDATION_ERROR');
      expect(bad.body.error.details).toEqual({ fields: ['isOnSale'] });
      const off = await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: false } });
      expect(off.body.data.isOnSale).toBe(false);
      const on = await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: true } });
      expect(on.body.data.isOnSale).toBe(true);
    });
  });

  // ------------------------------------------------- SRS acceptance criteria
  describe('SRS acceptance criteria (one test per AC)', () => {
    const adminProduct = async (id: string) => (await call('GET', '/api/products', { token: admin })).body.data.find((p: any) => p.productId === id);

    it('AC-1: addItem(P1, 0) -> QTY_OUT_OF_RANGE and the cart stays empty', async () => {
      expectError(await add(normal, 'P1', 0), 400, 'QTY_OUT_OF_RANGE');
      expect((await getCart(normal)).lines).toEqual([]);
    });

    it('AC-2: P1 x8 then addItem(P1, 3) -> QTY_OUT_OF_RANGE and P1 stays at 8', async () => {
      await add(normal, 'P1', 8);
      expectError(await add(normal, 'P1', 3), 400, 'QTY_OUT_OF_RANGE');
      expect((await getCart(normal)).lines[0]).toMatchObject({ productId: 'P1', quantity: 8 });
    });

    it('AC-3: P2 x2 (stock 3) then addItem(P2, 2) -> INSUFFICIENT_STOCK and P2 stays at 2', async () => {
      await add(normal, 'P2', 2);
      expectError(await add(normal, 'P2', 2), 409, 'INSUFFICIENT_STOCK');
      expect((await getCart(normal)).lines[0]).toMatchObject({ productId: 'P2', quantity: 2 });
    });

    it('AC-4: prime P1+P2 with SAVE10, inCity standard -> discount 165, shipping 0, total 1,485', async () => {
      await add(prime, 'P1', 1); await add(prime, 'P2', 1); await bindCoupon(prime);
      const r = await checkout(prime, 'inCity', 'standard');
      expect(r.body.data.order).toMatchObject({ subtotal: 1650, totalWeightGram: 1200, discount: 165, discountSource: 'coupon', shippingFee: 0, netTotal: 1485 });
    });

    it('AC-5: prime P1+P2 without coupon -> member discount floor(82.5) = 82, total 1,568', async () => {
      await add(prime, 'P1', 1); await add(prime, 'P2', 1);
      const r = await checkout(prime, 'inCity', 'standard');
      expect(r.body.data.order).toMatchObject({ discount: 82, discountSource: 'member', shippingFee: 0, netTotal: 1568 });
    });

    it('AC-6: prime P1 x2 (900) with SAVE10, upcountry express -> coupon removed, discount 45, shipping 25, total 880', async () => {
      await add(prime, 'P1', 2); await bindCoupon(prime);
      const r = await checkout(prime, 'upcountry', 'express');
      expect(r.status).toBe(201);
      expect(r.body.data.messages).toEqual([expect.objectContaining({ kind: 'notice', code: 'COUPON_NOT_APPLICABLE', message: 'คูปองไม่สามารถใช้กับคำสั่งซื้อนี้' })]);
      expect(r.body.data.order).toMatchObject({ subtotal: 900, totalWeightGram: 600, discount: 45, discountSource: 'member', shippingFee: 25, netTotal: 880, couponCode: null });
    });

    it('AC-7: coupon disabled by admin after binding -> removed at checkout, discount 0, shipping 30, total 1,230', async () => {
      await add(normal, 'P2', 1); await bindCoupon(normal);
      await call('PATCH', '/api/admin/coupons/SAVE10/status', { token: admin, body: { active: false } });
      const r = await checkout(normal, 'inCity', 'standard');
      expect(r.body.data.messages[0]).toMatchObject({ kind: 'notice', code: 'COUPON_NOT_APPLICABLE' });
      expect(r.body.data.order).toMatchObject({ subtotal: 1200, totalWeightGram: 900, discount: 0, discountSource: 'none', shippingFee: 30, netTotal: 1230, couponCode: null });
    });

    it('AC-8: normal P3, remote express -> shipping 270, total 15,270', async () => {
      await add(normal, 'P3', 1);
      const r = await checkout(normal, 'remote', 'express');
      expect(r.body.data.order).toMatchObject({ discount: 0, shippingFee: 270, netTotal: 15270 });
    });

    it('AC-9: P3 x3 (24,000g) -> WEIGHT_LIMIT_EXCEEDED, still in cart stage, cart unchanged', async () => {
      await add(normal, 'P3', 3);
      const before = await getCart(normal);
      expectError(await checkout(normal), 409, 'WEIGHT_LIMIT_EXCEEDED');
      expect(await getCart(normal)).toEqual(before);
      expect(before.stage).toBe('cart');
    });

    it('AC-10: P1 closed by admin -> ITEMS_UNAVAILABLE [P1], cart unchanged', async () => {
      await add(normal, 'P1', 1);
      await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: false } });
      const before = await getCart(normal);
      const r = await checkout(normal);
      expectError(r, 409, 'ITEMS_UNAVAILABLE');
      expect(r.body.error.details.productIds).toEqual(['P1']);
      expect(await getCart(normal)).toEqual(before);
    });

    it('AC-11a: P2 x3 checkout -> pending order, checkout stage, P2 stock 0', async () => {
      await add(normal, 'P2', 3);
      const r = await checkout(normal);
      expect(r.status).toBe(201);
      expect(r.body.data.order.status).toBe('pending');
      expect((await getCart(normal)).stage).toBe('checkout');
      expect(await stockOf('P2')).toBe(0);
    });

    it('AC-11b: stock reserved by another customer -> ITEMS_UNAVAILABLE [P2], cart unchanged', async () => {
      await add(prime, 'P2', 1); // added before cus_normal checks out
      await add(normal, 'P2', 3);
      expect((await checkout(normal)).status).toBe(201);
      const before = await getCart(prime);
      const r = await checkout(prime);
      expectError(r, 409, 'ITEMS_UNAVAILABLE');
      expect(r.body.error.details.productIds).toEqual(['P2']);
      expect(await getCart(prime)).toEqual(before);
      expect(before.stage).toBe('cart');
    });

    it('AC-11c: stock reserved by another customer -> addItem(P2, 1) is PRODUCT_UNAVAILABLE', async () => {
      await add(normal, 'P2', 3);
      await checkout(normal);
      expectError(await add(prime, 'P2', 1), 409, 'PRODUCT_UNAVAILABLE');
      expect((await getCart(prime)).lines).toEqual([]);
    });

    it('AC-12: cancelCheckout -> order cancelled, P2 stock 3, cart stage with P2 x3', async () => {
      await add(normal, 'P2', 3);
      const order = (await checkout(normal)).body.data.order;
      expect(await stockOf('P2')).toBe(0);
      const r = await call('POST', '/api/checkout/cancel', { token: normal });
      expect(r.body.data.stage).toBe('cart');
      expect(r.body.data.lines).toEqual([expect.objectContaining({ productId: 'P2', quantity: 3 })]);
      expect(await stockOf('P2')).toBe(3);
      expect((await call('GET', `/api/orders/${order.orderId}`, { token: normal })).body.data.status).toBe('cancelled');
    });

    it('AC-13: new price does not change the order but changes other customers\' carts', async () => {
      await add(normal, 'P1', 1);
      const order = (await checkout(normal)).body.data.order;
      await add(prime, 'P1', 1);
      await call('PATCH', '/api/admin/products/P1', { token: admin, body: { price: 500 } });
      const stored = (await call('GET', `/api/orders/${order.orderId}`, { token: normal })).body.data;
      expect(stored.lines[0].price).toBe(450);
      expect((await getCart(prime)).lines[0].price).toBe(500);
    });

    it('AC-14: customer calling updateProduct -> AUTH_FORBIDDEN and the price stays 450', async () => {
      expectError(await call('PATCH', '/api/admin/products/P1', { token: normal, body: { price: 500 } }), 403, 'AUTH_FORBIDDEN');
      expect((await adminProduct('P1')).price).toBe(450);
    });

    it('AC-15: another customer viewing the order -> ORDER_NOT_FOUND', async () => {
      await add(normal, 'P1', 1);
      const order = (await checkout(normal)).body.data.order;
      expectError(await call('GET', `/api/orders/${order.orderId}`, { token: prime }), 404, 'ORDER_NOT_FOUND');
    });

    it('AC-16: updateProduct(P1, price 0, stock 10000) -> VALIDATION_ERROR [price, stock], nothing changed', async () => {
      const r = await call('PATCH', '/api/admin/products/P1', { token: admin, body: { price: 0, stock: 10000 } });
      expectError(r, 400, 'VALIDATION_ERROR');
      expect(r.body.error.details.fields).toEqual(['price', 'stock']);
      expect(await adminProduct('P1')).toMatchObject({ price: 450, stock: 20 });
    });

    it('AC-17: addItem while in checkout stage -> OPERATION_NOT_ALLOWED, cart/stage/stock unchanged', async () => {
      await add(normal, 'P1', 1);
      await checkout(normal);
      const before = await getCart(normal);
      const stock = await stockOf('P1');
      expectError(await add(normal, 'P1', 1), 409, 'OPERATION_NOT_ALLOWED');
      expect(await getCart(normal)).toEqual(before);
      expect(await stockOf('P1')).toBe(stock);
    });

    it('AC-18a: paySuccess -> order paid, cart emptied with no coupon, stage success', async () => {
      await add(normal, 'P2', 1); await bindCoupon(normal);
      const order = (await checkout(normal)).body.data.order;
      await pay(order.orderId, 'success');
      expect((await call('GET', `/api/orders/${order.orderId}`, { token: normal })).body.data.status).toBe('paid');
      expect(await getCart(normal)).toMatchObject({ stage: 'success', lines: [], couponCode: null });
    });

    it('AC-18b: continueShopping from the success stage -> empty cart stage', async () => {
      await add(normal, 'P1', 1);
      await pay((await checkout(normal)).body.data.order.orderId, 'success');
      const r = await call('POST', '/api/continue-shopping', { token: normal });
      expect(r.body.data).toMatchObject({ stage: 'cart', lines: [] });
    });

    it('AC-19a/19b: admin disables SAVE10 and listCoupons shows it as inactive', async () => {
      const off = await call('PATCH', '/api/admin/coupons/SAVE10/status', { token: admin, body: { active: false } });
      expect(off.body.data.active).toBe(false);
      const list = await call('GET', '/api/admin/coupons', { token: admin });
      expect(list.body.data).toEqual([{ code: 'SAVE10', percent: 10, minSpend: 1000, active: false }]);
    });
  });

  // ------------------------------------------ further SRS requirements (FR-x)
  describe('additional SRS requirements', () => {
    it('FR-1.1: a fresh customer starts in cart stage with no lines, coupon or orders', async () => {
      expect(await getCart(normal)).toMatchObject({ stage: 'cart', lines: [], couponCode: null, currentOrderId: null });
      expect((await call('GET', '/api/orders', { token: normal })).body.data).toEqual([]);
    });

    it('FR-2.5.1: PATCH with a non-integer quantity -> VALIDATION_ERROR', async () => {
      await add(normal, 'P1', 2);
      for (const quantity of ['3', 2.5, null])
        expectError(await call('PATCH', '/api/cart/items/P1', { token: normal, body: { quantity } }), 400, 'VALIDATION_ERROR');
      expect((await getCart(normal)).lines[0].quantity).toBe(2);
    });

    it('FR-2.5.4: PATCH on a line whose product became unavailable -> PRODUCT_UNAVAILABLE', async () => {
      await add(normal, 'P1', 2);
      await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: false } });
      expectError(await call('PATCH', '/api/cart/items/P1', { token: normal, body: { quantity: 1 } }), 409, 'PRODUCT_UNAVAILABLE');
      expect((await getCart(normal)).lines[0].quantity).toBe(2);
    });

    it('FR-2.7.3: an unavailable line can still be removed', async () => {
      await add(normal, 'P1', 2);
      await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: false } });
      const r = await call('DELETE', '/api/cart/items/P1', { token: normal });
      expect(r.status).toBe(200);
      expect(r.body.data.cart.lines).toEqual([]);
    });

    it('FR-3.3: the same coupon can be used for any number of orders', async () => {
      for (let i = 0; i < 2; i++) {
        await add(prime, 'P2', 1); await bindCoupon(prime);
        const order = (await checkout(prime)).body.data.order;
        expect(order).toMatchObject({ discount: 120, discountSource: 'coupon', couponCode: 'SAVE10' });
        await pay(order.orderId, 'success');
        await call('POST', '/api/continue-shopping', { token: prime });
      }
      expect((await call('GET', '/api/orders', { token: prime })).body.data).toHaveLength(2);
    });

    it('FR-5.3.9: cart lines stay intact while waiting for payment', async () => {
      await add(prime, 'P1', 2); await add(prime, 'P2', 1);
      await checkout(prime);
      const lines = (await getCart(prime)).lines;
      expect(lines.map((l: any) => [l.productId, l.quantity])).toEqual([['P1', 2], ['P2', 1]]);
    });

    it('FR-7.2.2: a coupon removed at checkout is not re-bound after cancel', async () => {
      await add(normal, 'P1', 1); await bindCoupon(normal); // 450 < minSpend
      await checkout(normal);
      const cart = (await call('POST', '/api/checkout/cancel', { token: normal })).body.data;
      expect(cart.couponCode).toBeNull();
    });

    it('FR-7.3: after cancel the cart is editable and the next checkout gets a new orderId', async () => {
      await add(normal, 'P1', 1);
      const first = (await checkout(normal)).body.data.order;
      await call('POST', '/api/checkout/cancel', { token: normal });
      expect((await call('PATCH', '/api/cart/items/P1', { token: normal, body: { quantity: 2 } })).status).toBe(200);
      const second = (await checkout(normal)).body.data.order;
      expect(second.orderId).toMatch(UUID);
      expect(second.orderId).not.toBe(first.orderId);
      expect(second.subtotal).toBe(900);
    });

    it('FR-9.3.3: setting the sale status to its current value succeeds', async () => {
      const r = await call('PATCH', '/api/admin/products/P1/status', { token: admin, body: { isOnSale: true } });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ productId: 'P1', isOnSale: true, price: 450, stock: 20 });
    });

    it('FR-9.3.5 / FR-10.1.4: status changes do not alter existing orders', async () => {
      await add(prime, 'P2', 1); await bindCoupon(prime);
      const order = (await checkout(prime)).body.data.order;
      await call('PATCH', '/api/admin/coupons/SAVE10/status', { token: admin, body: { active: false } });
      await call('PATCH', '/api/admin/products/P2/status', { token: admin, body: { isOnSale: false } });
      const stored = (await call('GET', `/api/orders/${order.orderId}`, { token: prime })).body.data;
      expect(stored).toEqual(order);
      expect(stored).toMatchObject({ couponCode: 'SAVE10', discount: 120, status: 'pending' });
    });
  });
});
