import { describe, expect, it } from 'vitest';
import {
  isProductAvailable, validateQuantityChange, calculateSubtotal, calculateTotalWeight,
  calculateDiscount, calculateShippingFee, calculateNetTotal, validateCheckout,
  validateProductUpdate,
} from '../../src/domain/pricing.js';

// Primary oracle: SRS-CART-002_v1.8_pubs.md, sections 2, 4 and DC-1.
// Resolved TODOs are executable tables in srs-v18.test.ts; IDs are preserved.
describe('FR-1 / availability decision table', () => {
  it.each([
    [true, 0, false], [true, 1, true], [true, 2, true],
    [false, 0, false], [false, 1, false], [false, 2, false],
  ] as const)('sale=%s stock=%s -> %s', (sale, stock, expected) => {
    const actual = isProductAvailable(sale, stock);
    expect(actual).toBe(expected);
  });
});

const quantityInput = {
  operation: 'add' as const, quantity: 1, productExists: true, inCart: true,
  available: true, currentQtyInCart: 0, availableStock: 20,
};
describe('FR-2.1–2.6 / quantity ECP, BVA and decision tables', () => {
  for (const operation of ['add', 'update'] as const) {
    // Wrap each value so [] is passed as a quantity, not interpreted as an empty argument row.
    it.each(['2', '', null, undefined, true, {}, [], 1.5, NaN, Infinity, -Infinity].map(quantity => [quantity]))(
      operation + ' rejects non-integer #%# %s without coercion', quantity => {
        const actual = validateQuantityChange({ ...quantityInput, operation, quantity });
        expect(actual).toBe('VALIDATION_ERROR');
      });
    it.each([-1, 0, 11])(operation + ' rejects out-of-range %s', quantity => {
      const actual = validateQuantityChange({ ...quantityInput, operation, quantity });
      expect(actual).toBe('QTY_OUT_OF_RANGE');
    });
    it.each([1, 2, 9, 10])(operation + ' accepts boundary/interior %s', quantity => {
      const actual = validateQuantityChange({ ...quantityInput, operation, quantity });
      expect(actual).toBe('OK');
    });
    it.each([
      { quantity: 2, availableStock: 1, expected: 'INSUFFICIENT_STOCK' },
      { quantity: 2, availableStock: 2, expected: 'OK' },
      { quantity: 2, availableStock: 3, expected: 'OK' },
    ])(operation + ' stock boundary $availableStock -> $expected', row => {
      const actual = validateQuantityChange({ ...quantityInput, operation, ...row });
      expect(actual).toBe(row.expected);
    });
  }

  it.each([
    { name: 'missing product', patch: { productExists: false }, expected: 'PRODUCT_NOT_FOUND' },
    { name: 'update absent line', patch: { operation: 'update' as const, inCart: false }, expected: 'ITEM_NOT_IN_CART' },
    { name: 'unavailable product', patch: { available: false }, expected: 'PRODUCT_UNAVAILABLE' },
    { name: 'add reaches ten', patch: { currentQtyInCart: 9 }, expected: 'OK' },
    { name: 'add exceeds ten', patch: { currentQtyInCart: 10 }, expected: 'QTY_OUT_OF_RANGE' },
    { name: 'add exceeds stock', patch: { currentQtyInCart: 2, availableStock: 2 }, expected: 'INSUFFICIENT_STOCK' },
    { name: 'update replaces quantity', patch: { operation: 'update' as const, currentQtyInCart: 10, availableStock: 1 }, expected: 'OK' },
  ])('$name', ({ patch, expected }) => {
    const actual = validateQuantityChange({ ...quantityInput, ...patch });
    expect(actual).toBe(expected);
  });

});

describe('FR-4 / independent arithmetic examples', () => {
  it.each([
    { name: 'empty', lines: [], subtotal: 0, weight: 0 },
    { name: 'AC-4', lines: [{ price: 450, weightGram: 300, quantity: 1 }, { price: 1200, weightGram: 900, quantity: 1 }], subtotal: 1650, weight: 1200 },
    { name: 'multiple quantities', lines: [{ price: 137, weightGram: 210, quantity: 3 }, { price: 259, weightGram: 35, quantity: 2 }], subtotal: 929, weight: 700 },
  ])('$name subtotal/weight; input unchanged', ({ lines, subtotal, weight }) => {
    const before = structuredClone(lines);
    const actualSubtotal = calculateSubtotal(lines);
    const actualWeight = calculateTotalWeight(lines);
    expect(actualSubtotal).toBe(subtotal);
    expect(actualWeight).toBe(weight);
    expect(lines).toEqual(before);
  });

  it.each([
    [1650, 165, 0, 1485], [929, 92, 30, 867], [450, 0, 30, 480], [100, 100, 80, 80],
  ])('net subtotal=%s discount=%s shipping=%s -> %s', (subtotal, discount, shipping, expected) => {
    const actual = calculateNetTotal(subtotal, discount, shipping);
    expect(actual).toBe(expected);
  });
});

describe('FR-3 / FR-4 / coupon decision table and floor', () => {
  for (const member of ['normal', 'prime'] as const) {
    it.each([
      { subtotal: 1000, percent: 10, expected: 100 },
      { subtotal: 1001, percent: 10, expected: 100 },
      { subtotal: 1650, percent: 10, expected: 165 },
      { subtotal: 1650, percent: 1, expected: 16 },
      { subtotal: 1650, percent: 0, expected: 0 },
      { subtotal: 1650, percent: 100, expected: 1650 },
    ].filter(row => member === 'normal' || (row.subtotal === 1650 && row.percent === 10)))(
      member + ' eligible coupon $percent% at $subtotal -> $expected (no stacking)', row => {
      const coupon = { percent: row.percent, minSpend: 1000, active: true };
      const before = { ...coupon };
      const actual = calculateDiscount(row.subtotal, member, coupon);
      expect(actual).toEqual({ discount: row.expected, source: 'coupon', couponRemoved: false });
      expect(coupon).toEqual(before);
    });
  }

  // FR-4.2.1–4.2.2 now establish precedence; the five former GAP-P cases
  // execute in srs-v18.test.ts using their original IDs and expected amounts.

  it.each([
    { name: 'below minimum', subtotal: 999, coupon: { percent: 10, minSpend: 1000, active: true }, removed: true },
    { name: 'inactive below minimum', subtotal: 999, coupon: { percent: 10, minSpend: 1000, active: false }, removed: true },
    { name: 'inactive at minimum', subtotal: 1000, coupon: { percent: 10, minSpend: 1000, active: false }, removed: true },
    { name: 'inactive above minimum', subtotal: 1001, coupon: { percent: 10, minSpend: 1000, active: false }, removed: true },
    { name: 'no coupon', subtotal: 1650, coupon: null, removed: false },
  ])('normal: $name', ({ subtotal, coupon, removed }) => {
    const actual = calculateDiscount(subtotal, 'normal', coupon);
    expect(actual).toEqual({ discount: 0, source: 'none', couponRemoved: removed });
  });
});

describe('FR-4 / shipping and weight evidence', () => {
  it('AC-4 / README: medium, inCity, standard, prime costs zero', () => {
    const actual = calculateShippingFee('medium', 'inCity', 'standard', 'prime');
    expect(actual).toBe(0);
  });
  it.todo('SOI-1 / classifyWeight: specify zero-weight behavior');
});

const checkoutInput = {
  zone: 'inCity', speed: 'standard', totalWeightGram: 1200,
  lines: [{ productId: 'P1', quantity: 2, available: true, availableStock: 2 }],
};
describe('FR-5 / checkout precedence and combinations', () => {
  it.each([
    ['INCity', 'standard'], ['', 'standard'], [null, 'standard'], [undefined, 'standard'],
    [1, 'standard'], ['inCity', 'FAST'], ['inCity', ''], ['inCity', null],
    ['inCity', undefined], ['inCity', true],
  ])('invalid zone=%j speed=%j precedes empty/overweight', (zone, speed) => {
    const actual = validateCheckout({ ...checkoutInput, zone, speed, lines: [], totalWeightGram: 99999 });
    expect(actual).toEqual({ result: 'VALIDATION_ERROR' });
  });
  for (const zone of ['inCity', 'upcountry', 'remote']) {
    it.each(['standard', 'express'])('accepts ' + zone + ' / %s', speed => {
      const actual = validateCheckout({ ...checkoutInput, zone, speed });
      expect(actual).toEqual({ result: 'OK' });
    });
  }
  it('empty cart precedes weight validation', () => {
    const actual = validateCheckout({ ...checkoutInput, lines: [], totalWeightGram: 99999 });
    expect(actual).toEqual({ result: 'CART_EMPTY' });
  });
  it('collects every unavailable ID before weight validation, preserving input', () => {
    const input = { ...checkoutInput, totalWeightGram: 99999, lines: [
      { productId: 'OFF', quantity: 1, available: false, availableStock: 5 },
      { productId: 'LOW', quantity: 3, available: true, availableStock: 2 },
      { productId: 'OK', quantity: 2, available: true, availableStock: 2 },
      { productId: 'BOTH', quantity: 1, available: false, availableStock: 0 },
    ] };
    const before = structuredClone(input);
    const actual = validateCheckout(input);
    expect(actual.result).toBe('ITEMS_UNAVAILABLE');
    if (actual.result !== 'ITEMS_UNAVAILABLE') throw new Error('Expected unavailable details');
    expect([...actual.productIds].sort()).toEqual(['BOTH', 'LOW', 'OFF']);
    expect(input).toEqual(before);
  });
});

describe('FR-9 / product update contract boundaries', () => {
  it.each([1, 2, 49999, 50000])('valid price %s', price => {
    const actual = validateProductUpdate({ price });
    expect(actual).toEqual([]);
  });
  it.each([0, 1, 9998, 9999])('valid stock %s', stock => {
    const actual = validateProductUpdate({ stock });
    expect(actual).toEqual([]);
  });
  it.each([0, -1, 50001, 1.5, '1', null, true, {}, [], NaN, Infinity, -Infinity])('invalid price %s', price => {
    const actual = validateProductUpdate({ price, stock: 1 });
    expect(actual).toEqual(['price']);
  });
  it.each([-1, 10000, 0.5, '0', null, false, {}, [], NaN, Infinity, -Infinity])('invalid stock %s', stock => {
    const actual = validateProductUpdate({ price: 1, stock });
    expect(actual).toEqual(['stock']);
  });
  it.each([
    { price: 1, stock: 0 }, { price: 1, stock: 9999 },
    { price: 50000, stock: 0 }, { price: 50000, stock: 9999 },
  ])('valid corner $price / $stock', input => {
    const actual = validateProductUpdate(input);
    expect(actual).toEqual([]);
  });
  it('reports all invalid fields in price, stock order', () => {
    const actual = validateProductUpdate({ price: 0, stock: -1 });
    expect(actual).toEqual(['price', 'stock']);
  });
  it('API-specific SOI-3: empty patch reports both fields', () => {
    const actual = validateProductUpdate({});
    expect(actual).toEqual(['price', 'stock']);
  });
});