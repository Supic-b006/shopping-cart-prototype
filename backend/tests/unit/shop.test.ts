import { describe, expect, it } from 'vitest';
import { payment } from '../../src/domain/shop.js';
import type { Stage } from '../../src/domain/types.js';
import { CREATED_AT, ORDER_ID, expectRejected, fixture, pendingOrder, readyCart } from './helpers.js';

describe('Review corrections / FR-0.7 / FR-2 / FR-5 / FR-6 / FR-7', () => {
  it('UT-263: checkout reserves two units immediately: stock 20 becomes 18', () => {
    const { state, shop } = readyCart();
    state.carts[0].lines[0].quantity = 2;
    expect(state.products[0].stock).toBe(20);

    const { order } = shop.checkout('inCity', 'standard', ORDER_ID, CREATED_AT);

    expect(state.products.map(product => product.stock)).toEqual([18, 9, 5, 0]);
    expect(order.lines[0]).toEqual({
      productId: 'P1', name: 'Coffee', price: 450, weightGram: 300, quantity: 2,
    });
    expect(state.carts[0].stage).toBe('checkout');
  });

  it('UT-264: accumulated quantity 9 plus 2 rejects without changing an existing cart', () => {
    const { state, shop } = readyCart();
    state.carts[0].lines[0].quantity = 9;

    expectRejected(state, () => shop.quantity('add', 'P1', 2), 'QTY_OUT_OF_RANGE');

    expect(state.carts[0].lines).toEqual([
      { productId: 'P1', quantity: 9 }, { productId: 'P2', quantity: 1 },
    ]);
  });

  it('UT-265: update to 4 with stock 3 rejects and retains previous quantity 2', () => {
    const { state, shop } = readyCart();
    state.carts[0].lines[0].quantity = 2;
    state.products[0].stock = 3;

    expectRejected(state, () => shop.quantity('update', 'P1', 4), 'INSUFFICIENT_STOCK');

    expect(state.carts[0].lines).toEqual([
      { productId: 'P1', quantity: 2 }, { productId: 'P2', quantity: 1 },
    ]);
  });

  it('UT-266: cancel then modify cart and reorder preserves the earlier order snapshot', () => {
    const { state, shop } = pendingOrder();
    const original = structuredClone(state.orders[0]);
    shop.cancel();
    const cancelled = { ...original, status: 'cancelled' as const };
    const nextId = '00000000-0000-4000-8000-000000000002';

    shop.quantity('update', 'P1', 2);
    shop.remove('P2');
    const { order } = shop.checkout('inCity', 'standard', nextId, '2026-01-02T00:00:00.000Z');

    expect(shop.order(ORDER_ID)).toEqual(cancelled);
    expect(state.orders).toHaveLength(2);
    expect(order.orderId).toBe(nextId);
    expect(order.status).toBe('pending');
    expect(order.lines).toEqual([
      { productId: 'P1', name: 'Coffee', price: 450, weightGram: 300, quantity: 2 },
    ]);
    expect(order.subtotal).toBe(900);
    expect(order.totalWeightGram).toBe(600);
    expect(state.products.map(product => product.stock)).toEqual([18, 10, 5, 0]);
    expect(state.carts[0].currentOrderId).toBe(nextId);
    // FR-4.3–4.4, FR-4.7–4.8 now provide the fallback oracle.
    expect(order).toMatchObject({ discount: 45, discountSource: 'member', shippingFee: 0, netTotal: 855 });
  });

  it.each([
    { id: 'UT-267', operation: 'payment success' },
    { id: 'UT-268', operation: 'payment failure' },
    { id: 'UT-269', operation: 'cancellation' },
  ])('$id: $operation affects only its intended order and owner', ({ operation }) => {
    const { state, shop, otherShop } = pendingOrder();
    const historical = structuredClone(state.orders[0]);
    shop.cancel();
    const cancelled = { ...historical, status: 'cancelled' as const };
    const aliceId = '00000000-0000-4000-8000-000000000002';
    const bobId = '00000000-0000-4000-8000-000000000003';
    shop.checkout('inCity', 'standard', aliceId, '2026-01-02T00:00:00.000Z');
    otherShop.quantity('add', 'P2', 2);
    otherShop.checkout('inCity', 'standard', bobId, '2026-01-03T00:00:00.000Z');
    const before = structuredClone(state);
    // Target is deliberately neither the first order nor the most recent order.
    expect(before.orders.map(order => order.orderId)).toEqual([ORDER_ID, aliceId, bobId]);

    if (operation === 'cancellation') shop.cancel();
    else payment(state, aliceId, operation === 'payment success');

    expect(state.orders[0]).toEqual(cancelled);
    expect(state.orders[2]).toEqual(before.orders[2]);
    expect(state.carts[1]).toEqual(before.carts[1]);
    expect(state.coupons).toEqual(before.coupons);
    expect(state.orders).toHaveLength(3);
    if (operation === 'payment failure') {
      expect(state).toEqual(before);
    } else if (operation === 'payment success') {
      expect(state.orders[1]).toEqual({ ...before.orders[1], status: 'paid' });
      expect(state.carts[0]).toMatchObject({
        userId: 'alice', stage: 'success', lines: [], couponCode: null,
      });
      expect(state.products).toEqual(before.products);
    } else {
      expect(state.orders[1]).toEqual({ ...before.orders[1], status: 'cancelled' });
      expect(state.carts[0]).toMatchObject({
        userId: 'alice', stage: 'cart', lines: before.carts[0].lines, couponCode: before.carts[0].couponCode,
      });
      expect(state.products).toEqual([
        { ...before.products[0], stock: 20 },
        { ...before.products[1], stock: 8 },
        before.products[2], before.products[3],
      ]);
    }
  });
});


describe('FR-0 / FR-1 / FR-2 / cart operations', () => {
  it('customer sees available products, admin sees all; reads leave state unchanged', () => {
    const { state, shop, admin } = fixture();
    const before = structuredClone(state);
    const visible = shop.products();
    const all = admin.products();
    expect(visible.map(p => p.productId)).toEqual(['P1', 'P2']);
    expect(all).toEqual(before.products);
    expect(state).toEqual(before);
  });

  it('add accumulates, update replaces, inventory and another customer remain unchanged', () => {
    const { state, shop } = fixture();
    const beforeProducts = structuredClone(state.products);
    const beforeOther = structuredClone(state.carts[1]);
    shop.quantity('add', 'P1', 2);
    shop.quantity('add', 'P1', 3);
    expect(state.carts[0].lines).toEqual([{ productId: 'P1', quantity: 5 }]);
    const actual = shop.quantity('update', 'P1', 1);
    expect(actual.lines.map(l => ({ id: l.productId, quantity: l.quantity }))).toEqual([{ id: 'P1', quantity: 1 }]);
    expect(actual.subtotal).toBe(450);
    expect(state.products).toEqual(beforeProducts);
    expect(state.carts[1]).toEqual(beforeOther);
  });

  it.each([
    ['add', 'MISSING', 1, 'PRODUCT_NOT_FOUND'],
    ['update', 'P1', 1, 'ITEM_NOT_IN_CART'],
    ['add', 'OFF', 1, 'PRODUCT_UNAVAILABLE'],
    ['add', 'ZERO', 1, 'PRODUCT_UNAVAILABLE'],
    ['add', 'P1', '2', 'VALIDATION_ERROR'],
    ['add', 'P1', 0, 'QTY_OUT_OF_RANGE'],
    ['add', 'P1', 11, 'QTY_OUT_OF_RANGE'],
  ] as const)('%s %s qty=%s rejects with %s without mutation', (op, id, quantity, code) => {
    const { state, shop } = fixture();
    expectRejected(state, () => shop.quantity(op, id, quantity), code);
  });

  it('rejects stock shortage without modifying either cart', () => {
    const { state, shop } = fixture();
    state.products[0].stock = 1;
    expectRejected(state, () => shop.quantity('add', 'P1', 2), 'INSUFFICIENT_STOCK');
  });

  it('cart uses current price/availability and never detaches an inactive coupon on read', () => {
    const { state, shop, admin } = readyCart();
    admin.updateProduct('P1', { price: 600 });
    admin.productStatus('P1', false);
    admin.couponStatus('SAVE10', false);
    const before = structuredClone(state);
    const actual = shop.cart();
    expect(actual.subtotal).toBe(1800);
    expect(actual.lines[0]).toEqual({ ...before.products[0], quantity: 1, available: false });
    expect(actual.couponCode).toBe('SAVE10');
    expect(state).toEqual(before);
  });

  it('remove succeeds for unavailable lines, retains coupon, reports empty cart only after last removal', () => {
    const { state, shop } = readyCart();
    state.products[0].isOnSale = false;
    const products = structuredClone(state.products);
    const first = shop.remove('P1');
    expect(first.messages).toEqual([]);
    expect(state.carts[0].lines).toEqual([{ productId: 'P2', quantity: 1 }]);
    const last = shop.remove('P2');
    expect(last.cart.lines).toEqual([]);
    expect(last.cart.couponCode).toBe('SAVE10');
    expect(last.messages).toEqual([{ kind: 'info', code: '', message: 'ตะกร้าว่าง' }]);
    expect(state.products).toEqual(products);
  });

  it('empty removal rejects without mutation', () => {
    const { state, shop } = fixture();
    expectRejected(state, () => shop.remove('P1'), 'CART_EMPTY', {}, 'ไม่มีสินค้าให้ลบ');
  });
  it('missing line removal rejects without mutation', () => {
    const { state, shop } = readyCart();
    expectRejected(state, () => shop.remove('MISSING'), 'ITEM_NOT_IN_CART', {}, 'ไม่พบสินค้าในตะกร้า');
  });
});

describe('FR-3 / coupon attachment', () => {
  it('allows active coupon on empty/below-minimum cart and replaces previous coupon', () => {
    const { state, shop } = fixture();
    const beforeProducts = structuredClone(state.products);
    const empty = shop.coupon('SAVE10');
    expect(empty.couponCode).toBe('SAVE10');
    expect(empty.lines).toEqual([]);
    shop.quantity('add', 'P1', 1);
    const below = shop.coupon('SAVE10');
    expect(below.couponCode).toBe('SAVE10');
    expect(below.subtotal).toBe(450);
    const replaced = shop.coupon('SMALL');
    expect(replaced.couponCode).toBe('SMALL');
    expect(state.products).toEqual(beforeProducts);
  });
  it.each(['save10', ' SAVE10', 'SAVE10 ', '', 'UNKNOWN', 'OFF10'])(
    'rejects exact-string/active mismatch %j preserving existing coupon', code => {
      const { state, shop } = readyCart();
      expectRejected(state, () => shop.coupon(code), 'COUPON_INVALID');
    });
});

describe('FR-5 / checkout, reservation and snapshots', () => {
  it('AC-4: creates exact pending snapshot, reserves once and changes only owner cart', () => {
    const { state, shop } = readyCart();
    const beforeOther = structuredClone(state.carts[1]);
    const actual = shop.checkout('inCity', 'standard', ORDER_ID, CREATED_AT);
    expect(actual).toEqual({ order: {
      orderId: ORDER_ID, userId: 'alice', status: 'pending', createdAt: CREATED_AT,
      lines: [
        { productId: 'P1', name: 'Coffee', price: 450, weightGram: 300, quantity: 1 },
        { productId: 'P2', name: 'Equipment', price: 1200, weightGram: 900, quantity: 1 },
      ],
      subtotal: 1650, discount: 165, discountSource: 'coupon', shippingFee: 0,
      netTotal: 1485, totalWeightGram: 1200, zone: 'inCity', speed: 'standard', couponCode: 'SAVE10',
    }, messages: [] });
    expect(state.orders).toEqual([actual.order]);
    expect(state.products.map(p => p.stock)).toEqual([19, 9, 5, 0]);
    expect(state.carts[0]).toEqual({
      userId: 'alice', stage: 'checkout', couponCode: 'SAVE10', currentOrderId: ORDER_ID,
      lines: [{ productId: 'P1', quantity: 1 }, { productId: 'P2', quantity: 1 }],
    });
    expect(state.carts[1]).toEqual(beforeOther);
    expectRejected(state, () => shop.checkout('inCity', 'standard', 'retry', CREATED_AT), 'OPERATION_NOT_ALLOWED');
  });

  it.each(['invalid options', 'empty cart', 'unavailable items'] as const)(
    '%s fails before coupon removal and reservation', failure => {
      const { state, shop } = readyCart();
      state.coupons[0].active = false;
      if (failure === 'empty cart') state.carts[0].lines = [];
      if (failure === 'unavailable items') {
        state.products[0].isOnSale = false;
        state.products[1].stock = 0;
      }
      const code = failure === 'invalid options' ? 'VALIDATION_ERROR'
        : failure === 'empty cart' ? 'CART_EMPTY' : 'ITEMS_UNAVAILABLE';
      expectRejected(state,
        () => shop.checkout(failure === 'invalid options' ? 'INVALID' : 'inCity', 'standard', ORDER_ID, CREATED_AT),
        code, failure === 'unavailable items' ? { productIds: ['P1', 'P2'] } : {},
        failure === 'empty cart' ? 'ไม่สามารถชำระเงินได้ ตะกร้าว่าง' : undefined);
    });

  it.each(['inactive', 'below minimum'] as const)(
    '%s coupon is detached with a success notice only on valid checkout', reason => {
      const { state, shop } = readyCart();
      if (reason === 'inactive') state.coupons[0].active = false;
      else state.coupons[0].minSpend = 2000;
      const actual = shop.checkout('inCity', 'standard', ORDER_ID, CREATED_AT);
      expect(actual.messages).toEqual([{
        kind: 'notice', code: 'COUPON_NOT_APPLICABLE', message: 'คูปองไม่สามารถใช้กับคำสั่งซื้อนี้',
      }]);
      expect(actual.order.couponCode).toBeNull();
      expect(state.carts[0].couponCode).toBeNull();
      expect(state.carts[0].stage).toBe('checkout');
      expect(state.orders).toHaveLength(1);
      expect(state.products.map(p => p.stock)).toEqual([19, 9, 5, 0]);
      expect(actual.order).toMatchObject({
        subtotal: 1650, discount: 82, discountSource: 'member', shippingFee: 0, netTotal: 1568,
      });
    });

  it('FR-9: admin price/stock/status changes do not change an existing order snapshot', () => {
    const { state, shop, admin, order } = pendingOrder();
    const snapshot = structuredClone(order);
    admin.updateProduct('P1', { price: 999, stock: 7 });
    admin.productStatus('P1', false);
    admin.couponStatus('SAVE10', false);
    const actual = shop.order(ORDER_ID);
    expect(actual).toEqual(snapshot);
    expect(state.orders).toEqual([snapshot]);
    expect(state.products[0]).toMatchObject({ price: 999, stock: 7, isOnSale: false });
  });

  it('FR-7: cancel adds snapshot quantities to current stock, keeps cart/coupon and cannot restore twice', () => {
    const { state, shop, admin } = readyCart();
    state.carts[0].lines[0].quantity = 2;
    const { order } = shop.checkout('inCity', 'standard', ORDER_ID, CREATED_AT);
    const beforeLines = structuredClone(state.carts[0].lines);
    const beforeOrder = structuredClone(order);
    const beforeOther = structuredClone(state.carts[1]);
    admin.updateProduct('P1', { stock: 7 });
    admin.couponStatus('SAVE10', false);
    const actual = shop.cancel();
    expect(state.products.map(p => p.stock)).toEqual([9, 10, 5, 0]);
    expect(state.orders[0]).toEqual({ ...beforeOrder, status: 'cancelled' });
    expect(actual.stage).toBe('cart');
    expect(actual.couponCode).toBe('SAVE10');
    expect(state.carts[0].lines).toEqual(beforeLines);
    expect(state.carts[1]).toEqual(beforeOther);
    expectRejected(state, () => shop.cancel(), 'OPERATION_NOT_ALLOWED');
  });

  it('FR-0 / FR-5 / FR-7: sequential buyers compete for last stock; cancel makes it available again', () => {
    const { state, shop, otherShop } = readyCart();
    state.products[0].stock = 1;
    otherShop.quantity('add', 'P1', 1);
    shop.checkout('inCity', 'standard', ORDER_ID, CREATED_AT);
    expect(state.products[0].stock).toBe(0);
    expectRejected(state,
      () => otherShop.checkout('inCity', 'standard', 'bob-order', CREATED_AT),
      'ITEMS_UNAVAILABLE', { productIds: ['P1'] });
    shop.cancel();
    expect(state.products[0].stock).toBe(1);
    const actual = otherShop.checkout('inCity', 'standard', 'bob-order', CREATED_AT);
    expect(actual.order.userId).toBe('bob');
    expect(actual.order.status).toBe('pending');
    expect(state.products[0].stock).toBe(0);
    expect(state.orders.map(order => order.status)).toEqual(['cancelled', 'pending']);
    expect(state.carts.map(cart => cart.stage)).toEqual(['cart', 'checkout']);
  });

  it('FR-5.3.10: elapsed time/read alone never releases reservation', () => {
    const { state, shop } = readyCart();
    shop.checkout('inCity', 'standard', ORDER_ID, '2000-01-01T00:00:00.000Z');
    const before = structuredClone(state);
    const order = shop.order(ORDER_ID);
    shop.orders();
    shop.cart();
    expect(order.status).toBe('pending');
    expect(state).toEqual(before);
  });
});

describe('FR-6 / payment state machine', () => {
  it('fail leaves entire state unchanged; retry succeeds without reducing stock twice', () => {
    const { state, order } = pendingOrder();
    const before = structuredClone(state);
    const failed = payment(state, ORDER_ID, false);
    expect(failed.order).toEqual(before.orders[0]);
    expect(failed.messages).toEqual([{ kind: 'info', code: '', message: 'การชำระเงินล้มเหลว กรุณาลองใหม่' }]);
    expect(state).toEqual(before);
    const paid = payment(state, ORDER_ID, true);
    expect(paid).toEqual({ order: { ...before.orders[0], status: 'paid' }, messages: [] });
    expect(order.status).toBe('paid');
    expect(state.carts[0].lines).toEqual([]);
    expect(state.carts[0].couponCode).toBeNull();
    expect(state.carts[0].stage).toBe('success');
    expect(state.products).toEqual(before.products);
    expect(state.carts[1]).toEqual(before.carts[1]);
  });

  it.each([true, false])('missing order success=%s is rejected unchanged', success => {
    const { state } = fixture();
    expectRejected(state, () => payment(state, 'MISSING', success), 'ORDER_NOT_FOUND');
  });
  for (const success of [true, false]) {
    it.each(['paid', 'cancelled', 'wrong stage'] as const)(
      'rejects ' + (success ? 'success' : 'fail') + ' for %s without mutation', reason => {
        const { state, shop } = pendingOrder();
        if (reason === 'paid') payment(state, ORDER_ID, true);
        if (reason === 'cancelled') shop.cancel();
        if (reason === 'wrong stage') state.carts[0].stage = 'cart';
        expectRejected(state, () => payment(state, ORDER_ID, success), 'OPERATION_NOT_ALLOWED');
      });
  }

  it('continue-shopping returns success to cart while preserving paid order/inventory', () => {
    const { state, shop } = pendingOrder();
    payment(state, ORDER_ID, true);
    const beforeOrders = structuredClone(state.orders);
    const beforeProducts = structuredClone(state.products);
    const actual = shop.continueShopping();
    expect(actual).toMatchObject({ userId: 'alice', stage: 'cart', couponCode: null,
      lines: [], subtotal: 0 });
    expect(state.orders).toEqual(beforeOrders);
    expect(state.products).toEqual(beforeProducts);
  });

  it('gateway uses the order owner even when that owner is not first in state.carts', () => {
    const { state } = pendingOrder();
    state.carts.reverse();
    const beforeOther = structuredClone(state.carts[0]);
    payment(state, ORDER_ID, true);
    expect(state.carts[0]).toEqual(beforeOther);
    expect(state.carts[1]).toMatchObject({ userId: 'alice', stage: 'success', lines: [], couponCode: null });
  });
  // SRS does not define corrupt internal State/currentOrderId handling.
  it.todo('UT-232 / SOI-5: payment failure with inconsistent currentOrderId needs a State-invariant contract');
  it.todo('UT-236 / SOI-5: payment success with inconsistent currentOrderId needs a State-invariant contract');
});

describe('FR-0 / FR-8 / role, ownership and stage guards', () => {
  const mutations = [
    { name: 'add', stage: 'cart', act: (shop: ReturnType<typeof fixture>['shop']) => shop.quantity('add', 'P1', 1) },
    { name: 'update', stage: 'cart', act: (shop: ReturnType<typeof fixture>['shop']) => shop.quantity('update', 'P1', 1) },
    { name: 'remove', stage: 'cart', act: (shop: ReturnType<typeof fixture>['shop']) => shop.remove('P1') },
    { name: 'coupon', stage: 'cart', act: (shop: ReturnType<typeof fixture>['shop']) => shop.coupon('SAVE10') },
    { name: 'checkout', stage: 'cart', act: (shop: ReturnType<typeof fixture>['shop']) => shop.checkout('inCity', 'standard', ORDER_ID, CREATED_AT) },
    { name: 'cancel', stage: 'checkout', act: (shop: ReturnType<typeof fixture>['shop']) => shop.cancel() },
    { name: 'continue', stage: 'success', act: (shop: ReturnType<typeof fixture>['shop']) => shop.continueShopping() },
  ];
  for (const row of mutations) {
    for (const stage of ['cart', 'checkout', 'success'] as Stage[]) {
      if (stage === row.stage) continue;
      it(row.name + ' forbidden in ' + stage + ' (valid payload)', () => {
        const { state, shop } = readyCart();
        state.carts[0].stage = stage;
        expectRejected(state, () => row.act(shop), 'OPERATION_NOT_ALLOWED');
      });
    }
    it('Admin cannot perform customer ' + row.name, () => {
      const { state, admin } = readyCart();
      state.carts[0].stage = row.stage as Stage;
      expectRejected(state, () => row.act(admin), 'AUTH_FORBIDDEN');
    });
  }
  it.each(['cart', 'checkout', 'success'] as const)('reads are permitted in %s and leave state unchanged', stage => {
    const { state, shop } = pendingOrder();
    state.carts[0].stage = stage;
    const before = structuredClone(state);
    expect(shop.cart().stage).toBe(stage);
    expect(shop.order(ORDER_ID)).toEqual(before.orders[0]);
    expect(shop.orders()).toEqual(before.orders);
    expect(shop.products().map(p => p.productId)).toEqual(['P1', 'P2']);
    expect(state).toEqual(before);
  });
  it('owner can read order, other customer cannot distinguish foreign/missing order', () => {
    const { state, shop, otherShop, order } = pendingOrder();
    expect(shop.order(ORDER_ID)).toEqual(order);
    expect(otherShop.orders()).toEqual([]);
    expectRejected(state, () => otherShop.order(ORDER_ID), 'ORDER_NOT_FOUND');
    expectRejected(state, () => otherShop.order('MISSING'), 'ORDER_NOT_FOUND');
  });
  it('lists only own orders newest first without reordering state.orders', () => {
    const { state, shop, order } = pendingOrder();
    state.orders.push(
      { ...structuredClone(order), orderId: 'newer', createdAt: '2026-01-02T00:00:00.000Z' },
      { ...structuredClone(order), orderId: 'foreign', userId: 'bob', createdAt: '2026-01-03T00:00:00.000Z' },
    );
    const before = structuredClone(state);
    const actual = shop.orders();
    expect(actual.map(o => o.orderId)).toEqual(['newer', ORDER_ID]);
    expect(state).toEqual(before);
  });
  it.each(['cart', 'orders', 'order'] as const)('Admin cannot read customer %s', method => {
    const { state, admin } = pendingOrder();
    expectRejected(state, () => method === 'order' ? admin.order(ORDER_ID) : admin[method](), 'AUTH_FORBIDDEN');
  });
  it('API-specific SOI-2: wrong stage precedes invalid payload and missing product', () => {
    const { state, shop } = pendingOrder();
    expectRejected(state, () => shop.quantity('add', 'MISSING', 'bad'), 'OPERATION_NOT_ALLOWED');
    expectRejected(state, () => shop.checkout('bad', 'bad', 'retry', CREATED_AT), 'OPERATION_NOT_ALLOWED');
  });
  it.todo('SOI-2: SRS confirmation for wrong-stage plus invalid-payload precedence (API.md explicitly chooses stage first)');
  it.todo('SOI-4: tie ordering when createdAt is identical; do not assert implementation tie-breaker');
});

describe('FR-9 / FR-10 / admin product and coupon operations', () => {
  it.each([
    { price: 1 }, { price: 50000 }, { stock: 0 }, { stock: 9999 }, { price: 50000, stock: 9999 },
  ])('updates only supplied fields %j; new stock is absolute', patch => {
    const { state, admin } = fixture();
    const before = structuredClone(state);
    const actual = admin.updateProduct('P1', patch);
    const expected = { ...before.products[0], ...patch };
    expect(actual).toEqual(expected);
    expect(state).toEqual({ ...before, products: [expected, ...before.products.slice(1)] });
  });
  it.each([
    { patch: { price: 0 }, fields: ['price'] },
    { patch: { stock: -1 }, fields: ['stock'] },
    { patch: { price: 0, stock: -1 }, fields: ['price', 'stock'] },
    { patch: { price: 900, stock: -1 }, fields: ['stock'] },
    { patch: {}, fields: ['price', 'stock'] },
  ])('invalid patch %j is atomic', ({ patch, fields }) => {
    const { state, admin } = fixture();
    expectRejected(state, () => admin.updateProduct('P1', patch), 'VALIDATION_ERROR', { fields });
  });
  it('product existence precedes invalid fields', () => {
    const { state, admin } = fixture();
    expectRejected(state, () => admin.updateProduct('MISSING', { price: 0, stock: -1 }), 'PRODUCT_NOT_FOUND');
  });
  for (const status of [true, false]) {
    it('sets boolean product/coupon status to ' + status, () => {
      const { state, admin } = fixture();
      const before = structuredClone(state);
      const product = admin.productStatus('P1', status);
      const coupon = admin.couponStatus('SAVE10', status);
      expect(product).toEqual({ ...before.products[0], isOnSale: status });
      expect(coupon).toEqual({ ...before.coupons[0], active: status });
      expect(state).toEqual({
        ...before, products: [{ ...before.products[0], isOnSale: status }, ...before.products.slice(1)],
        coupons: [{ ...before.coupons[0], active: status }, ...before.coupons.slice(1)],
      });
    });
  }
  it.each(['true', 'false', 0, 1, null, undefined])('rejects non-boolean status %j without coercion', status => {
    const { state, admin } = fixture();
    expectRejected(state, () => admin.productStatus('P1', status), 'VALIDATION_ERROR', { fields: ['isOnSale'] });
    expectRejected(state, () => admin.couponStatus('SAVE10', status), 'VALIDATION_ERROR', { fields: ['active'] });
  });
  it('rejects missing product/coupon status targets', () => {
    const { state, admin } = fixture();
    expectRejected(state, () => admin.productStatus('MISSING', true), 'PRODUCT_NOT_FOUND');
    expectRejected(state, () => admin.couponStatus('MISSING', true), 'COUPON_NOT_FOUND');
  });
  it('lists both active and inactive coupons without mutation', () => {
    const { state, admin } = fixture();
    const before = structuredClone(state);
    const actual = admin.coupons();
    expect(actual).toEqual(before.coupons);
    expect(state).toEqual(before);
  });
  it.each(['product update', 'product status', 'coupon status', 'coupon list'] as const)(
    'Customer cannot perform admin %s', operation => {
      const { state, shop } = fixture();
      const act = () => {
        if (operation === 'product update') return shop.updateProduct('P1', { price: 100 });
        if (operation === 'product status') return shop.productStatus('P1', true);
        if (operation === 'coupon status') return shop.couponStatus('SAVE10', true);
        return shop.coupons();
      };
      expectRejected(state, act, 'AUTH_FORBIDDEN');
    });
});