import { describe, expect, it } from 'vitest';
import { calculateDiscount, calculateShippingFee, classifyWeight, validateCheckout, validateQuantityChange } from '../../src/domain/pricing.js';
import { Shop } from '../../src/domain/shop.js';
import type { MemberTier, State, User } from '../../src/domain/types.js';
import { CREATED_AT, ORDER_ID, expectRejected } from './helpers.js';

// Independent oracles: SRS-CART-002_v1.8_pubs.md (FR/DC-1/AC), not production output.
// Parent IDs preserve the original TODO; suffixes identify its additional table rows.
const childId = (parent: string, index: number) => index === 0 ? parent : `${parent}.${String(index + 1).padStart(2, '0')}`;
describe('SRS v1.8 / FR-2.6 / simultaneous-error decision table', () => {
  const rows = [
    { operation: 'add', quantity: '0', productExists: false, inCart: false, available: false, currentQtyInCart: 10, availableStock: 0, expected: 'VALIDATION_ERROR' },
    { operation: 'update', quantity: '0', productExists: false, inCart: false, available: false, currentQtyInCart: 10, availableStock: 0, expected: 'VALIDATION_ERROR' },
    { operation: 'add', quantity: 0, productExists: false, inCart: false, available: false, currentQtyInCart: 10, availableStock: 0, expected: 'QTY_OUT_OF_RANGE' },
    { operation: 'update', quantity: 11, productExists: false, inCart: false, available: false, currentQtyInCart: 10, availableStock: 0, expected: 'QTY_OUT_OF_RANGE' },
    { operation: 'add', quantity: 1, productExists: false, inCart: false, available: false, currentQtyInCart: 10, availableStock: 0, expected: 'PRODUCT_NOT_FOUND' },
    { operation: 'update', quantity: 1, productExists: false, inCart: false, available: false, currentQtyInCart: 10, availableStock: 0, expected: 'ITEM_NOT_IN_CART' },
    { operation: 'add', quantity: 1, productExists: true, inCart: true, available: false, currentQtyInCart: 10, availableStock: 0, expected: 'PRODUCT_UNAVAILABLE' },
    { operation: 'update', quantity: 2, productExists: true, inCart: true, available: false, currentQtyInCart: 1, availableStock: 1, expected: 'PRODUCT_UNAVAILABLE' },
    { operation: 'add', quantity: 2, productExists: true, inCart: true, available: true, currentQtyInCart: 9, availableStock: 9, expected: 'QTY_OUT_OF_RANGE' },
    { operation: 'add', quantity: 2, productExists: true, inCart: true, available: true, currentQtyInCart: 1, availableStock: 2, expected: 'INSUFFICIENT_STOCK' },
    { operation: 'update', quantity: 3, productExists: true, inCart: true, available: true, currentQtyInCart: 1, availableStock: 2, expected: 'INSUFFICIENT_STOCK' },
  ] as const;
  it.each(rows.map((row, i) => ({ ...row, id: childId('UT-055', i) })))('$id: $operation -> $expected', ({ expected, ...input }) => {
    const before = structuredClone(input);
    const actual = validateQuantityChange(input);
    expect(actual).toBe(expected);
    expect(input).toEqual(before);
  });
});

describe('SRS v1.8 / FR-4.2–FR-4.4 / discount and floor', () => {
  const rows = [
    { subtotal: 999, coupon: null, discount: 49, removed: false },
    { subtotal: 1000, coupon: null, discount: 50, removed: false },
    { subtotal: 1001, coupon: null, discount: 50, removed: false },
    { subtotal: 999, coupon: { percent: 10, minSpend: 1000, active: false }, discount: 49, removed: true },
    { subtotal: 1000, coupon: { percent: 10, minSpend: 1000, active: false }, discount: 50, removed: true },
    { subtotal: 1001, coupon: { percent: 10, minSpend: 1000, active: false }, discount: 50, removed: true },
    { subtotal: 999, coupon: { percent: 10, minSpend: 1000, active: true }, discount: 49, removed: true },
    { subtotal: 1000, coupon: { percent: 10, minSpend: 1001, active: true }, discount: 50, removed: true },
    { subtotal: 1001, coupon: { percent: 10, minSpend: 1002, active: true }, discount: 50, removed: true },
  ];
  it.each(rows.map((row, i) => ({ ...row, id: childId('UT-077', i) })))('$id: prime fallback at $subtotal', ({ subtotal, coupon, discount, removed }) => {
    const before = structuredClone(coupon);
    const actual = calculateDiscount(subtotal, 'prime', coupon);
    expect(actual).toEqual({ discount, source: 'member', couponRemoved: removed });
    expect(coupon).toEqual(before);
  });

  // FR-4.2.2 forbids an additional member discount when an eligible coupon applies.
  // These synthetic DC-1 inputs test the generic formula, not seeded coupon validity.
  it.each([
    { id: 'UT-089', percent: 0, subtotal: 1650, expected: 0 },
    { id: 'UT-090', percent: 1, subtotal: 1650, expected: 16 },
    { id: 'UT-091', percent: 10, subtotal: 1000, expected: 100 },
    { id: 'UT-092', percent: 10, subtotal: 1001, expected: 100 },
    { id: 'UT-094', percent: 100, subtotal: 1650, expected: 1650 },
  ])('$id: eligible $percent% coupon at $subtotal takes precedence over prime', ({ percent, subtotal, expected }) => {
    const coupon = { percent, minSpend: 1000, active: true };
    const before = { ...coupon };
    const actual = calculateDiscount(subtotal, 'prime', coupon);
    expect(actual).toEqual({ discount: expected, source: 'coupon', couponRemoved: false });
    expect(coupon).toEqual(before);
  });
});

describe('SRS v1.8 / FR-4.5–FR-4.7 / weight and shipping', () => {
  it.each([
    [1, 'light'], [999, 'light'], [1000, 'light'], [1001, 'medium'], [4999, 'medium'],
    [5000, 'medium'], [5001, 'heavy'], [19999, 'heavy'], [20000, 'heavy'], [20001, 'overLimit'],
  ].map(([grams, expected], i) => ({ id: childId('UT-104', i), grams: grams as number, expected })))('$id: $grams grams -> $expected', ({ grams, expected }) => {
    const actual = classifyWeight(grams);
    expect(actual).toBe(expected);
  });

  // Nine SRS FR-4.6 rows with four manually calculated FR-4.7 outcomes each.
  // Values are literals: no copy of the production rates/formula in the oracle.
  const rates = [
    ['light', 'inCity', [30, 45, 0, 15]], ['light', 'upcountry', [50, 75, 0, 25]],
    ['light', 'remote', [80, 120, 0, 40]], ['medium', 'inCity', [50, 75, 0, 25]],
    ['medium', 'upcountry', [80, 120, 0, 40]], ['medium', 'remote', [120, 180, 0, 60]],
    ['heavy', 'inCity', [80, 120, 0, 40]], ['heavy', 'upcountry', [120, 180, 0, 60]],
    ['heavy', 'remote', [180, 270, 0, 90]],
  ] as const;
  const modes = [['normal', 'standard'], ['normal', 'express'], ['prime', 'standard'], ['prime', 'express']] as const;
  const shippingCases = rates.flatMap(([weight, zone, expected], r) => modes.map(([member, speed], c) => ({
    id: childId('UT-103', r * 4 + c), weight, zone, member, speed, expected: expected[c],
  })));
  it.each(shippingCases)('$id: $weight / $zone / $member / $speed -> $expected', ({ weight, zone, member, speed, expected }) => {
    const actual = calculateShippingFee(weight, zone, speed, member);
    expect(actual).toBe(expected);
  });
});

describe('SRS v1.8 / FR-5.2.1 / delivery weight boundary', () => {
  it.each([
    { grams: 19999, expected: 'OK' }, { grams: 20000, expected: 'OK' },
    { grams: 20001, expected: 'WEIGHT_LIMIT_EXCEEDED' },
  ].map((row, i) => ({ ...row, id: childId('UT-114', i) })))('$id: $grams grams -> $expected', ({ grams, expected }) => {
    const input = { zone: 'inCity', speed: 'standard', totalWeightGram: grams,
      lines: [{ productId: 'P1', quantity: 1, available: true, availableStock: 20 }] };
    const before = structuredClone(input);
    const actual = validateCheckout(input);
    expect(actual).toEqual({ result: expected });
    expect(input).toEqual(before);
  });
});

// Only the relevant section-7 seed facts, allocated afresh; no seed script or DB.
function srsFixture(tier: MemberTier) {
  const user: User = { id: 'customer', username: tier === 'prime' ? 'cus_prime' : 'cus_normal', role: 'Customer', memberTier: tier };
  const admin: User = { id: 'admin', username: 'admin01', role: 'Admin', memberTier: null };
  const state: State = {
    products: [
      { productId: 'P1', name: 'Coffee Beans 250g', price: 450, weightGram: 300, stock: 20, isOnSale: true },
      { productId: 'P2', name: 'Drip Kettle', price: 1200, weightGram: 900, stock: 3, isOnSale: true },
      { productId: 'P3', name: 'Espresso Machine', price: 15000, weightGram: 8000, stock: 5, isOnSale: true },
    ],
    coupons: [{ code: 'SAVE10', percent: 10, minSpend: 1000, active: true }],
    carts: [{ userId: user.id, stage: 'cart', lines: [], couponCode: null, currentOrderId: null }], orders: [],
  };
  return { state, shop: new Shop(state, user), admin: new Shop(state, admin) };
}

describe('SRS v1.8 / acceptance examples projected onto isolated Shop', () => {
  it('UT-270 / AC-5: prime without coupon totals 1568', () => {
    const { shop } = srsFixture('prime');
    shop.quantity('add', 'P1', 1);
    shop.quantity('add', 'P2', 1);
    const actual = shop.checkout('inCity', 'standard', ORDER_ID, CREATED_AT);
    expect(actual.order).toMatchObject({ subtotal: 1650, totalWeightGram: 1200, discount: 82,
      discountSource: 'member', shippingFee: 0, netTotal: 1568, couponCode: null, status: 'pending' });
    expect(actual.messages).toEqual([]);
  });
  it('UT-271 / AC-6: below-minimum coupon detaches; prime express totals 880', () => {
    const { state, shop } = srsFixture('prime');
    shop.quantity('add', 'P1', 2);
    shop.coupon('SAVE10');
    const actual = shop.checkout('upcountry', 'express', ORDER_ID, CREATED_AT);
    expect(actual.order).toMatchObject({ subtotal: 900, totalWeightGram: 600, discount: 45,
      discountSource: 'member', shippingFee: 25, netTotal: 880, couponCode: null, status: 'pending' });
    expect(actual.messages).toEqual([{ kind: 'notice', code: 'COUPON_NOT_APPLICABLE', message: 'คูปองไม่สามารถใช้กับคำสั่งซื้อนี้' }]);
    expect(state.carts[0].couponCode).toBeNull();
    expect(state.products[0].stock).toBe(18);
  });
  it('UT-272 / AC-7: deactivated coupon detaches; normal checkout totals 1230', () => {
    const { state, shop, admin } = srsFixture('normal');
    shop.quantity('add', 'P2', 1);
    shop.coupon('SAVE10');
    admin.couponStatus('SAVE10', false);
    const actual = shop.checkout('inCity', 'standard', ORDER_ID, CREATED_AT);
    expect(actual.order).toMatchObject({ subtotal: 1200, totalWeightGram: 900, discount: 0,
      discountSource: 'none', shippingFee: 30, netTotal: 1230, couponCode: null, status: 'pending' });
    expect(actual.messages).toEqual([{ kind: 'notice', code: 'COUPON_NOT_APPLICABLE', message: 'คูปองไม่สามารถใช้กับคำสั่งซื้อนี้' }]);
    expect(state.carts[0].couponCode).toBeNull();
  });
  it('UT-273 / AC-8: heavy remote express totals 15270', () => {
    const { shop } = srsFixture('normal');
    shop.quantity('add', 'P3', 1);
    const actual = shop.checkout('remote', 'express', ORDER_ID, CREATED_AT);
    expect(actual.order).toMatchObject({ subtotal: 15000, totalWeightGram: 8000, discount: 0,
      discountSource: 'none', shippingFee: 270, netTotal: 15270, status: 'pending' });
    expect(actual.messages).toEqual([]);
  });
  it('UT-274 / AC-9, FR-0.7: overweight rejects before coupon removal and reservation', () => {
    const { state, shop, admin } = srsFixture('normal');
    shop.quantity('add', 'P3', 3);
    shop.coupon('SAVE10');
    admin.couponStatus('SAVE10', false);
    expectRejected(state, () => shop.checkout('remote', 'express', ORDER_ID, CREATED_AT), 'WEIGHT_LIMIT_EXCEEDED');
    expect(state.orders).toEqual([]);
    expect(state.carts[0]).toMatchObject({ stage: 'cart', couponCode: 'SAVE10', lines: [{ productId: 'P3', quantity: 3 }] });
    expect(state.products[2].stock).toBe(5);
  });
  it('UT-275 / FR-7.2.2: cancellation does not reattach a detached coupon', () => {
    const { state, shop } = srsFixture('prime');
    shop.quantity('add', 'P1', 2);
    shop.coupon('SAVE10');
    shop.checkout('upcountry', 'express', ORDER_ID, CREATED_AT);
    const beforeOrder = structuredClone(state.orders[0]);
    expect(state.carts[0].couponCode).toBeNull();
    const actual = shop.cancel();
    expect(actual).toMatchObject({ stage: 'cart', couponCode: null });
    expect(state.carts[0].lines).toEqual([{ productId: 'P1', quantity: 2 }]);
    expect(state.products[0].stock).toBe(20);
    expect(state.orders).toEqual([{ ...beforeOrder, status: 'cancelled' }]);
  });
});
