import { describe, expect, it } from 'vitest';
import { calculateDiscount } from '../../src/domain/pricing.js';
import { payment } from '../../src/domain/shop.js';
import { CREATED_AT, ORDER_ID, fixture, pendingOrder } from './helpers.js';

// Oracles: SRS-CART-002_v1.8_pubs.md FR-3.3, FR-4.4.1, FR-6 and FR-9.2.
// Reuse fresh in-memory fixtures; no DB, HTTP, clocks or mocked business rules.
const SECOND_ID = '00000000-0000-4000-8000-000000000002';
const SECOND_TIME = '2026-01-02T00:00:00.000Z';

describe('SRS v1.8 / comparative review / high-value gaps', () => {
  it.each([
    { id: 'UT-276', subtotal: 1, expected: 0 },
    { id: 'UT-277', subtotal: 19, expected: 0 },
    { id: 'UT-278', subtotal: 20, expected: 1 },
  ])('$id / FR-4.4.1: prime subtotal $subtotal has discount $expected', ({ subtotal, expected }) => {
    const actual = calculateDiscount(subtotal, 'prime', null);

    // floor(0.05)=0, floor(0.95)=0, floor(1)=1, independently from FR-4.4.1.
    // Intentionally do not assert source: a zero amount does not settle that label.
    expect(actual).toMatchObject({ discount: expected, couponRemoved: false });
  });

  it('UT-279 / FR-3.3: the same coupon discounts two successfully paid orders', () => {
    const { state, shop } = fixture('prime');
    const originalCoupons = structuredClone(state.coupons);
    const otherCart = structuredClone(state.carts[1]);
    shop.quantity('add', 'P1', 1);
    shop.quantity('add', 'P2', 1);
    shop.coupon('SAVE10');
    const first = shop.checkout('inCity', 'standard', ORDER_ID, CREATED_AT);
    expect(first.order).toMatchObject({ orderId: ORDER_ID, status: 'pending',
      subtotal: 1650, discount: 165, discountSource: 'coupon', shippingFee: 0,
      netTotal: 1485, couponCode: 'SAVE10' });
    payment(state, ORDER_ID, true);
    expect(state.orders[0].status).toBe('paid');
    expect(state.carts[0]).toMatchObject({ stage: 'success', lines: [], couponCode: null });
    const firstPaidSnapshot = structuredClone(state.orders[0]);
    shop.continueShopping();
    shop.quantity('add', 'P2', 1);

    // Reapply after payment, not just after cancellation; use a different subtotal.
    const cart = shop.coupon('SAVE10');
    const second = shop.checkout('inCity', 'standard', SECOND_ID, SECOND_TIME);
    const paid = payment(state, SECOND_ID, true);

    expect(cart.couponCode).toBe('SAVE10');
    expect(second.messages).toEqual([]);
    expect(paid).toEqual({ order: {
      orderId: SECOND_ID, userId: 'alice', status: 'paid', createdAt: SECOND_TIME,
      lines: [{ productId: 'P2', name: 'Equipment', price: 1200, weightGram: 900, quantity: 1 }],
      subtotal: 1200, discount: 120, discountSource: 'coupon', shippingFee: 0,
      netTotal: 1080, totalWeightGram: 900, zone: 'inCity', speed: 'standard', couponCode: 'SAVE10',
    }, messages: [] });
    expect(state.orders).toEqual([firstPaidSnapshot, paid.order]);
    expect(state.orders.map(order => order.status)).toEqual(['paid', 'paid']);
    expect(state.carts[0]).toMatchObject({ stage: 'success', lines: [], couponCode: null });
    expect(state.products.map(product => product.stock)).toEqual([19, 8, 5, 0]);
    expect(state.coupons).toEqual(originalCoupons);
    expect(state.carts[1]).toEqual(otherCart);
  });

  it('UT-280 / FR-9.2: both carts see the new price while both paid snapshots stay unchanged', () => {
    const { state, shop, otherShop, admin } = fixture('normal');
    // Establish one paid snapshot per customer, with a known price and totals.
    for (const [customer, owner, id, time] of [
      [shop, 'alice', ORDER_ID, CREATED_AT],
      [otherShop, 'bob', SECOND_ID, SECOND_TIME],
    ] as const) {
      customer.quantity('add', 'P1', 1);
      const { order } = customer.checkout('inCity', 'standard', id, time);
      expect(order).toMatchObject({ userId: owner, status: 'pending',
        lines: [{ productId: 'P1', name: 'Coffee', price: 450, weightGram: 300, quantity: 1 }],
        subtotal: 450, discount: 0, shippingFee: 30, netTotal: 480 });
      payment(state, id, true);
      expect(order.status).toBe('paid');
      customer.continueShopping();
    }
    shop.quantity('add', 'P1', 2);
    otherShop.quantity('add', 'P1', 3);
    expect(shop.cart().subtotal).toBe(900);
    expect(otherShop.cart().subtotal).toBe(1350);
    const before = structuredClone(state);

    admin.updateProduct('P1', { price: 500 });
    const aliceCart = shop.cart();
    const bobCart = otherShop.cart();

    expect(aliceCart.lines).toEqual([{ ...before.products[0], price: 500, quantity: 2, available: true }]);
    expect(bobCart.lines).toEqual([{ ...before.products[0], price: 500, quantity: 3, available: true }]);
    expect(aliceCart.subtotal).toBe(1000);
    expect(bobCart.subtotal).toBe(1500);
    expect(shop.order(ORDER_ID)).toEqual(before.orders[0]);
    expect(otherShop.order(SECOND_ID)).toEqual(before.orders[1]);
    expect(state).toEqual({ ...before,
      products: [{ ...before.products[0], price: 500 }, ...before.products.slice(1)],
    });
  });

  it('UT-281 / FR-6.2–FR-6.3: three payment failures preserve reservation until success', () => {
    const { state } = pendingOrder();
    expect(state.orders[0]).toMatchObject({ status: 'pending', subtotal: 1650,
      discount: 165, shippingFee: 0, netTotal: 1485, couponCode: 'SAVE10' });
    expect(state.carts[0]).toMatchObject({ stage: 'checkout', couponCode: 'SAVE10',
      lines: [{ productId: 'P1', quantity: 1 }, { productId: 'P2', quantity: 1 }],
    });
    expect(state.products.map(product => product.stock)).toEqual([19, 9, 5, 0]);
    const beforeFailures = structuredClone(state);

    for (let attempt = 1; attempt <= 3; attempt++) {
      const failed = payment(state, ORDER_ID, false);

      expect(failed, `failure ${attempt}`).toEqual({ order: beforeFailures.orders[0],
        messages: [{ kind: 'info', code: '', message: 'การชำระเงินล้มเหลว กรุณาลองใหม่' }],
      });
      expect(state, `entire State after failure ${attempt}`).toEqual(beforeFailures);
    }
    const paid = payment(state, ORDER_ID, true);

    expect(paid).toEqual({ order: { ...beforeFailures.orders[0], status: 'paid' }, messages: [] });
    expect(state.orders).toEqual([{ ...beforeFailures.orders[0], status: 'paid' }]);
    expect(state.carts[0]).toMatchObject({ userId: 'alice', stage: 'success', lines: [], couponCode: null });
    expect(state.products).toEqual(beforeFailures.products);
    expect(state.coupons).toEqual(beforeFailures.coupons);
    expect(state.carts[1]).toEqual(beforeFailures.carts[1]);
  });
});
