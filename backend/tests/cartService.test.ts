import { describe, expect, it } from 'vitest';
import {
  calculateDiscount,
  calculateNetTotal,
  calculateShippingFee,
  calculateSubtotal,
  calculateTotalWeight,
  classifyWeight,
  isProductAvailable,
  validateCheckout,
  validateProductUpdate,
  validateQuantityChange,
} from '../src/cartService';

/**
 * Unit tests for the pure functions specified by SRS-CART-002 v1.8, section 6.1.
 * Tests are table-driven so each input row is an independently reported Vitest case.
 * Operations involving users, stages, persistence, orders, stock reservation,
 * authorization, or notices are service/API responsibilities and are not covered
 * by this pure-function module.
 */

/**
 * FR: นิยามสินค้าพร้อมขาย, FR-1.3.1, FR-2.2.2
 * เทคนิค: ECT แยกเปิด/ปิดขายและ stock พร้อมขาย; BVA ตรวจขอบ stock 0/1
 */
describe('isProductAvailable (Definitions, FR-1.3.1, FR-2.2.2)', () => {
  const cases = [
    { onSale: true, stock: 0, expected: false },
    { onSale: true, stock: 1, expected: true },
    { onSale: true, stock: 2, expected: true },
    { onSale: true, stock: 20, expected: true },
    { onSale: false, stock: 0, expected: false },
    { onSale: false, stock: 1, expected: false },
    { onSale: false, stock: 2, expected: false },
    { onSale: false, stock: 20, expected: false },
  ];
  it.each(cases)('onSale=$onSale, availableStock=$stock -> $expected', ({ onSale, stock, expected }) => {
    expect(isProductAvailable(onSale, stock)).toBe(expected);
  });
});

/**
 * FR: FR-2.1–2.6 โดยเฉพาะลำดับ first-failure ใน FR-2.6
 * เทคนิค: ECT สำหรับชนิดข้อมูลและเงื่อนไขสินค้า, BVA สำหรับ quantity 1/10 และ stock,
 * Decision Table/priority testing สำหรับ add/update และการเลือก error ขั้นแรก
 */
describe('validateQuantityChange (FR-2.1–2.6)', () => {
  const base = {
    operation: 'add' as const,
    productExists: true,
    inCart: false,
    available: true,
    currentQtyInCart: 0,
    availableStock: 20,
  };

  /** ECT: จำนวนเต็ม/ไม่ใช่จำนวนเต็ม; BVA: valid range 1–10 และค่าที่อยู่นอกช่วง */
  describe('quantity input class and range (FR-2.1, FR-2.6 steps 1–2)', () => {
    const nonIntegers: unknown[] = [2.5, -0.5, NaN, Infinity, -Infinity, '2', '', null, undefined, true, {}, []];
    it.each(nonIntegers.map((quantity) => ({ quantity })))('non-integer/invalid quantity $quantity -> VALIDATION_ERROR', ({ quantity }) => {
      expect(validateQuantityChange({ ...base, quantity })).toBe('VALIDATION_ERROR');
    });

    const outOfRange = [-100, -1, 0, 11, 12, 100];
    it.each(outOfRange.map((quantity) => ({ quantity })))('integer quantity $quantity -> QTY_OUT_OF_RANGE', ({ quantity }) => {
      expect(validateQuantityChange({ ...base, quantity })).toBe('QTY_OUT_OF_RANGE');
    });

    it.each([1, 2, 5, 9, 10].map((quantity) => ({ quantity })))('valid add quantity $quantity -> OK', ({ quantity }) => {
      expect(validateQuantityChange({ ...base, quantity })).toBe('OK');
    });
  });

  /** Decision Table: product มี/ไม่มี × available/ไม่ available; ตรวจลำดับ PRODUCT_NOT_FOUND ก่อน */
  describe('add precondition order (FR-2.2, FR-2.6 steps 3–4)', () => {
    const cases = [
      { productExists: false, available: false, expected: 'PRODUCT_NOT_FOUND' },
      { productExists: false, available: true, expected: 'PRODUCT_NOT_FOUND' },
      { productExists: true, available: false, expected: 'PRODUCT_UNAVAILABLE' },
      { productExists: true, available: true, expected: 'OK' },
    ] as const;
    it.each(cases)('exists=$productExists, available=$available -> $expected', ({ productExists, available, expected }) => {
      expect(validateQuantityChange({ ...base, quantity: 1, productExists, available })).toBe(expected);
    });
  });

  /** BVA แบบค่าพึ่งพากัน: current quantity + quantity ใหม่ ต้องไม่เกิน 10 */
  describe('add combined quantity limit (FR-2.3–2.4, FR-2.6 step 5)', () => {
    const cases = Array.from({ length: 11 }, (_, currentQtyInCart) =>
      Array.from({ length: 10 }, (_, index) => {
        const quantity = index + 1;
        return {
          currentQtyInCart,
          quantity,
          expected: currentQtyInCart + quantity > 10 ? 'QTY_OUT_OF_RANGE' : 'OK',
        };
      })
    ).flat();
    it.each(cases)('existing=$currentQtyInCart + add=$quantity -> $expected', ({ currentQtyInCart, quantity, expected }) => {
      expect(validateQuantityChange({ ...base, quantity, inCart: currentQtyInCart > 0, currentQtyInCart })).toBe(expected);
    });
  });

  /** BVA/priority: ตรวจ stock ที่ต่ำกว่า target และ stock เท่ากับ target; step 5 ต้องมี priority ก่อน step 6 */
  describe('stock check after add quantity check (FR-2.4.2, FR-2.6 step 6)', () => {
    const cases = Array.from({ length: 10 }, (_, currentQtyInCart) =>
      Array.from({ length: 10 }, (_, index) => {
        const quantity = index + 1;
        const target = currentQtyInCart + quantity;
        const availableStock = Math.max(0, target - 1);
        return {
          currentQtyInCart,
          quantity,
          availableStock,
          expected: target > 10 ? 'QTY_OUT_OF_RANGE' : 'INSUFFICIENT_STOCK',
        };
      })
    ).flat();
    it.each(cases)('existing=$currentQtyInCart + add=$quantity, stock=$availableStock -> $expected', ({ currentQtyInCart, quantity, availableStock, expected }) => {
      expect(validateQuantityChange({ ...base, quantity, currentQtyInCart, inCart: currentQtyInCart > 0, availableStock })).toBe(expected);
    });

    const exactStockCases = [1, 2, 3, 8, 10].map((quantity) => ({ quantity, availableStock: quantity }));
    it.each(exactStockCases)('quantity $quantity equal to stock $availableStock -> OK', ({ quantity, availableStock }) => {
      expect(validateQuantityChange({ ...base, quantity, availableStock })).toBe('OK');
    });
  });

  /** ECT/Decision Table สำหรับการมีรายการและ availability; BVA สำหรับ quantity/stock ของ update */
  describe('updateQuantity validation (FR-2.5, FR-2.6)', () => {
    const updateBase = { ...base, operation: 'update' as const, inCart: true, currentQtyInCart: 4 };
    const badPresence = [
      { inCart: false, available: false, expected: 'ITEM_NOT_IN_CART' },
      { inCart: false, available: true, expected: 'ITEM_NOT_IN_CART' },
      { inCart: true, available: false, expected: 'PRODUCT_UNAVAILABLE' },
      { inCart: true, available: true, expected: 'OK' },
    ] as const;
    it.each(badPresence)('inCart=$inCart, available=$available -> $expected', ({ inCart, available, expected }) => {
      expect(validateQuantityChange({ ...updateBase, quantity: 1, inCart, available })).toBe(expected);
    });

    const cases = Array.from({ length: 10 }, (_, index) =>
      Array.from({ length: 12 }, (_, stock) => {
        const quantity = index + 1;
        return { quantity, availableStock: stock, expected: quantity > stock ? 'INSUFFICIENT_STOCK' : 'OK' };
      })
    ).flat();
    it.each(cases)('update quantity=$quantity, stock=$availableStock -> $expected', ({ quantity, availableStock, expected }) => {
      expect(validateQuantityChange({ ...updateBase, quantity, availableStock })).toBe(expected);
    });

    it.each([0, 11].map((quantity) => ({ quantity })))('update quantity $quantity outside 1..10 -> QTY_OUT_OF_RANGE', ({ quantity }) => {
      expect(validateQuantityChange({ ...updateBase, quantity })).toBe('QTY_OUT_OF_RANGE');
    });
  });

  /** Priority Sequence Testing: ทำให้หลายเงื่อนไขผิดพร้อมกัน แล้วตรวจ error ขั้นแรกตาม FR-2.6 */
  describe('first-failure priority (FR-2.6)', () => {
    const cases = [
      { quantity: 1.5, productExists: false, inCart: false, available: false, currentQtyInCart: 20, availableStock: 0, expected: 'VALIDATION_ERROR' },
      { quantity: 0, productExists: false, inCart: false, available: false, currentQtyInCart: 20, availableStock: 0, expected: 'QTY_OUT_OF_RANGE' },
      { quantity: 1, productExists: false, inCart: false, available: false, currentQtyInCart: 20, availableStock: 0, expected: 'PRODUCT_NOT_FOUND' },
      { quantity: 1, productExists: true, inCart: false, available: false, currentQtyInCart: 20, availableStock: 0, expected: 'PRODUCT_UNAVAILABLE' },
      { quantity: 5, productExists: true, inCart: true, available: true, currentQtyInCart: 8, availableStock: 1, expected: 'QTY_OUT_OF_RANGE' },
      { quantity: 1, productExists: true, inCart: true, available: true, currentQtyInCart: 1, availableStock: 2, expected: 'OK' },
    ] as const;
    it.each(cases)('input reaches first failing step -> $expected', ({ expected, ...input }) => {
      expect(validateQuantityChange({ ...base, operation: 'add', ...input })).toBe(expected);
    });
  });
});

/**
 * FR: นิยาม subtotal/น้ำหนักรวม และ FR-4.1
 * เทคนิค: ECT สำหรับตะกร้าว่าง/หนึ่งหรือหลาย line; ใช้ข้อมูล seed และ AC เป็น expected values อิสระ
 */
describe('calculateSubtotal and calculateTotalWeight (Definitions, FR-4.1)', () => {
  it('empty lines produce zero subtotal and weight', () => {
    expect(calculateSubtotal([])).toBe(0);
    expect(calculateTotalWeight([])).toBe(0);
  });

  it('SRS seed products P1 x 1 and P2 x 1 produce subtotal 1,650 baht (AC-4/5)', () => {
    expect(calculateSubtotal([
      { price: 450, quantity: 1 },
      { price: 1200, quantity: 1 },
    ])).toBe(1650);
  });

  it('SRS seed products P1 x 1 and P2 x 1 produce total weight 1,200 g (AC-4)', () => {
    expect(calculateTotalWeight([
      { weightGram: 300, quantity: 1 },
      { weightGram: 900, quantity: 1 },
    ])).toBe(1200);
  });

  it('SRS seed product P1 x 2 produces subtotal 900 baht and weight 600 g (AC-6)', () => {
    const lines = [{ price: 450, weightGram: 300, quantity: 2 }];
    expect(calculateSubtotal(lines)).toBe(900);
    expect(calculateTotalWeight(lines)).toBe(600);
  });

  it('SRS seed product P3 x 3 produces total weight 24,000 g (AC-9)', () => {
    expect(calculateTotalWeight([{ weightGram: 8000, quantity: 3 }])).toBe(24000);
  });

  const quantityCases = [1, 2, 3, 5, 10].map((quantity) => ({ quantity }));
  it.each(quantityCases)('subtotal is unit price times quantity ($quantity)', ({ quantity }) => {
    expect(calculateSubtotal([{ price: 450, quantity }])).toBe(450 * quantity);
  });
  it.each(quantityCases)('weight is unit weight times quantity ($quantity)', ({ quantity }) => {
    expect(calculateTotalWeight([{ weightGram: 300, quantity }])).toBe(300 * quantity);
  });

  const lineCounts = [1, 2, 3, 5, 10];
  it.each(lineCounts.map((count) => ({ count })))('subtotal sums $count cart lines', ({ count }) => {
    const lines = Array.from({ length: count }, (_, index) => ({ price: (index + 1) * 100, quantity: index + 1 }));
    expect(calculateSubtotal(lines)).toBe(lines.reduce((sum, line) => sum + line.price * line.quantity, 0));
  });
  it.each(lineCounts.map((count) => ({ count })))('weight sums $count cart lines', ({ count }) => {
    const lines = Array.from({ length: count }, (_, index) => ({ weightGram: (index + 1) * 100, quantity: index + 1 }));
    expect(calculateTotalWeight(lines)).toBe(lines.reduce((sum, line) => sum + line.weightGram * line.quantity, 0));
  });
});

/**
 * FR: FR-4.2–4.4 และตาราง Decision Table ใน SRS ส่วน 10.3
 * เทคนิค: Decision Table ครอบคลุม rule R1–R7; BVA ที่ minSpend; ECT และการตรวจ floor/ไม่ทบส่วนลด
 */
describe('calculateDiscount (FR-4.2–4.4, Decision Table 10.3)', () => {
  const coupon = { percent: 10, minSpend: 1000, active: true };
  const rules = [
    { name: 'R1 no coupon / prime', tier: 'prime' as const, coupon: null, subtotal: 1650, expected: { discount: 82, source: 'member', couponRemoved: false } },
    { name: 'R2 no coupon / normal', tier: 'normal' as const, coupon: null, subtotal: 1650, expected: { discount: 0, source: 'none', couponRemoved: false } },
    { name: 'R3 inactive coupon / prime', tier: 'prime' as const, coupon: { ...coupon, active: false }, subtotal: 1650, expected: { discount: 82, source: 'member', couponRemoved: true } },
    { name: 'R4 inactive coupon / normal', tier: 'normal' as const, coupon: { ...coupon, active: false }, subtotal: 1650, expected: { discount: 0, source: 'none', couponRemoved: true } },
    { name: 'R5 active coupon below min / prime', tier: 'prime' as const, coupon, subtotal: 900, expected: { discount: 45, source: 'member', couponRemoved: true } },
    { name: 'R6 active coupon below min / normal', tier: 'normal' as const, coupon, subtotal: 900, expected: { discount: 0, source: 'none', couponRemoved: true } },
    { name: 'R7 active coupon at min / prime', tier: 'prime' as const, coupon, subtotal: 1000, expected: { discount: 100, source: 'coupon', couponRemoved: false } },
    { name: 'R7 active coupon above min / normal', tier: 'normal' as const, coupon, subtotal: 1650, expected: { discount: 165, source: 'coupon', couponRemoved: false } },
    { name: 'inactive coupon below min / normal', tier: 'normal' as const, coupon: { ...coupon, active: false }, subtotal: 900, expected: { discount: 0, source: 'none', couponRemoved: true } },
  ] as const;
  it.each(rules)('$name', ({ tier, coupon: selectedCoupon, subtotal, expected }) => {
    expect(calculateDiscount(subtotal, tier, selectedCoupon)).toEqual(expected);
  });

  const subtotals = [0, 1, 19, 20, 99, 100, 999, 1000, 1001, 1650, 9999, 10000];
  it.each(subtotals.map((subtotal) => ({ subtotal })))('prime member discount floors 5% at subtotal $subtotal', ({ subtotal }) => {
    const result = calculateDiscount(subtotal, 'prime', null);
    expect(result.discount).toBe(Math.floor(subtotal * 5 / 100));
    expect(result.couponRemoved).toBe(false);
  });
  it.each(subtotals.map((subtotal) => ({ subtotal })))('normal member receives zero discount at subtotal $subtotal', ({ subtotal }) => {
    expect(calculateDiscount(subtotal, 'normal', null)).toEqual({ discount: 0, source: 'none', couponRemoved: false });
  });

  const couponMathCases = [
    { subtotal: 1000, percent: 1 }, { subtotal: 1001, percent: 1 }, { subtotal: 1650, percent: 10 },
    { subtotal: 1999, percent: 10 }, { subtotal: 2500, percent: 15 }, { subtotal: 9999, percent: 25 },
  ];
  it.each(couponMathCases)('active coupon floors $percent% of $subtotal and does not stack member discount', ({ subtotal, percent }) => {
    expect(calculateDiscount(subtotal, 'prime', { percent, minSpend: 1000, active: true })).toEqual({
      discount: Math.floor(subtotal * percent / 100), source: 'coupon', couponRemoved: false,
    });
  });
});

/**
 * FR: FR-4.5
 * เทคนิค: BVA รอบ 1,000/1,001, 5,000/5,001 และ 20,000/20,001 กรัม พร้อมค่าภายในแต่ละ class
 */
describe('classifyWeight (FR-4.5)', () => {
  const cases = [
    { grams: 1, expected: 'light' },
    { grams: 999, expected: 'light' }, { grams: 1000, expected: 'light' },
    { grams: 1001, expected: 'medium' }, { grams: 1002, expected: 'medium' },
    { grams: 4999, expected: 'medium' }, { grams: 5000, expected: 'medium' },
    { grams: 5001, expected: 'heavy' }, { grams: 5002, expected: 'heavy' },
    { grams: 19999, expected: 'heavy' }, { grams: 20000, expected: 'heavy' },
    { grams: 20001, expected: 'overLimit' }, { grams: 25000, expected: 'overLimit' },
  ] as const;
  it.each(cases)('$grams grams -> $expected', ({ grams, expected }) => {
    expect(classifyWeight(grams)).toBe(expected);
  });
});

/**
 * FR: ตาราง base rate ใน FR-4.6 และตัวคูณ speed/memberTier ใน FR-4.7
 * เทคนิค: Full-factorial/exhaustive combination ทั้ง 3 weight tiers × 3 zones × 2 speeds × 2 tiers
 * รวม 36 cases (ครอบคลุม pairwise combinations ทั้งหมดด้วย); expected เป็นค่าคงที่อ้างจากตาราง SRS
 */
describe('calculateShippingFee (FR-4.6–4.7)', () => {
  // Expected values are transcribed independently from the FR-4.6 base-rate
  // table and FR-4.7 member/speed rules; they are not calculated from the SUT.
  const cases = [
    { tier: 'light', zone: 'inCity', speed: 'standard', memberTier: 'normal', expected: 30 },
    { tier: 'light', zone: 'inCity', speed: 'express', memberTier: 'normal', expected: 45 },
    { tier: 'light', zone: 'upcountry', speed: 'standard', memberTier: 'normal', expected: 50 },
    { tier: 'light', zone: 'upcountry', speed: 'express', memberTier: 'normal', expected: 75 },
    { tier: 'light', zone: 'remote', speed: 'standard', memberTier: 'normal', expected: 80 },
    { tier: 'light', zone: 'remote', speed: 'express', memberTier: 'normal', expected: 120 },
    { tier: 'medium', zone: 'inCity', speed: 'standard', memberTier: 'normal', expected: 50 },
    { tier: 'medium', zone: 'inCity', speed: 'express', memberTier: 'normal', expected: 75 },
    { tier: 'medium', zone: 'upcountry', speed: 'standard', memberTier: 'normal', expected: 80 },
    { tier: 'medium', zone: 'upcountry', speed: 'express', memberTier: 'normal', expected: 120 },
    { tier: 'medium', zone: 'remote', speed: 'standard', memberTier: 'normal', expected: 120 },
    { tier: 'medium', zone: 'remote', speed: 'express', memberTier: 'normal', expected: 180 },
    { tier: 'heavy', zone: 'inCity', speed: 'standard', memberTier: 'normal', expected: 80 },
    { tier: 'heavy', zone: 'inCity', speed: 'express', memberTier: 'normal', expected: 120 },
    { tier: 'heavy', zone: 'upcountry', speed: 'standard', memberTier: 'normal', expected: 120 },
    { tier: 'heavy', zone: 'upcountry', speed: 'express', memberTier: 'normal', expected: 180 },
    { tier: 'heavy', zone: 'remote', speed: 'standard', memberTier: 'normal', expected: 180 },
    { tier: 'heavy', zone: 'remote', speed: 'express', memberTier: 'normal', expected: 270 },
    { tier: 'light', zone: 'inCity', speed: 'standard', memberTier: 'prime', expected: 0 },
    { tier: 'light', zone: 'inCity', speed: 'express', memberTier: 'prime', expected: 15 },
    { tier: 'light', zone: 'upcountry', speed: 'standard', memberTier: 'prime', expected: 0 },
    { tier: 'light', zone: 'upcountry', speed: 'express', memberTier: 'prime', expected: 25 },
    { tier: 'light', zone: 'remote', speed: 'standard', memberTier: 'prime', expected: 0 },
    { tier: 'light', zone: 'remote', speed: 'express', memberTier: 'prime', expected: 40 },
    { tier: 'medium', zone: 'inCity', speed: 'standard', memberTier: 'prime', expected: 0 },
    { tier: 'medium', zone: 'inCity', speed: 'express', memberTier: 'prime', expected: 25 },
    { tier: 'medium', zone: 'upcountry', speed: 'standard', memberTier: 'prime', expected: 0 },
    { tier: 'medium', zone: 'upcountry', speed: 'express', memberTier: 'prime', expected: 40 },
    { tier: 'medium', zone: 'remote', speed: 'standard', memberTier: 'prime', expected: 0 },
    { tier: 'medium', zone: 'remote', speed: 'express', memberTier: 'prime', expected: 60 },
    { tier: 'heavy', zone: 'inCity', speed: 'standard', memberTier: 'prime', expected: 0 },
    { tier: 'heavy', zone: 'inCity', speed: 'express', memberTier: 'prime', expected: 40 },
    { tier: 'heavy', zone: 'upcountry', speed: 'standard', memberTier: 'prime', expected: 0 },
    { tier: 'heavy', zone: 'upcountry', speed: 'express', memberTier: 'prime', expected: 60 },
    { tier: 'heavy', zone: 'remote', speed: 'standard', memberTier: 'prime', expected: 0 },
    { tier: 'heavy', zone: 'remote', speed: 'express', memberTier: 'prime', expected: 90 },
  ] as const;
  it.each(cases)('$tier / $zone / $speed / $memberTier -> $expected baht', ({ tier, zone, speed, memberTier, expected }) => {
    expect(calculateShippingFee(tier, zone, speed, memberTier)).toBe(expected);
  });
});

/**
 * FR: FR-4.8
 * เทคนิค: ECT ตรวจสูตร subtotal − discount + shipping; AC-4 ถึง AC-8 ใช้ตรวจการประกอบ pure functions
 */
describe('calculateNetTotal (FR-4.8)', () => {
  const cases = [
    { subtotal: 0, discount: 0, shipping: 0 }, { subtotal: 1650, discount: 165, shipping: 0 },
    { subtotal: 1650, discount: 82, shipping: 0 }, { subtotal: 900, discount: 45, shipping: 25 },
    { subtotal: 1200, discount: 0, shipping: 30 }, { subtotal: 15000, discount: 0, shipping: 270 },
    { subtotal: 2100, discount: 100, shipping: 180 },
  ];
  it.each(cases)('$subtotal - $discount + $shipping', ({ subtotal, discount, shipping }) => {
    expect(calculateNetTotal(subtotal, discount, shipping)).toBe(subtotal - discount + shipping);
  });

  describe('SRS acceptance calculation examples (pure-function composition)', () => {
    const shippableWeightTier = (lines: { weightGram: number; quantity: number }[]) => {
      const tier = classifyWeight(calculateTotalWeight(lines));
      if (tier === 'overLimit') {
        throw new Error('These acceptance examples must be within the 20,000 g shipping limit');
      }
      return tier;
    };

    it('AC-4: coupon SAVE10 on P1 x 1 + P2 x 1 -> discount 165, shipping 0, total 1,485', () => {
      const lines = [
        { price: 450, weightGram: 300, quantity: 1 },
        { price: 1200, weightGram: 900, quantity: 1 },
      ];
      const subtotal = calculateSubtotal(lines);
      const weightTier = shippableWeightTier(lines);
      const { discount } = calculateDiscount(subtotal, 'prime', { percent: 10, minSpend: 1000, active: true });
      const shipping = calculateShippingFee(weightTier, 'inCity', 'standard', 'prime');
      expect({ subtotal, discount, shipping, total: calculateNetTotal(subtotal, discount, shipping) })
        .toEqual({ subtotal: 1650, discount: 165, shipping: 0, total: 1485 });
    });

    it('AC-5: prime member without coupon on P1 x 1 + P2 x 1 -> discount 82, total 1,568', () => {
      const lines = [
        { price: 450, weightGram: 300, quantity: 1 },
        { price: 1200, weightGram: 900, quantity: 1 },
      ];
      const subtotal = calculateSubtotal(lines);
      const weightTier = shippableWeightTier(lines);
      const { discount } = calculateDiscount(subtotal, 'prime', null);
      const shipping = calculateShippingFee(weightTier, 'inCity', 'standard', 'prime');
      expect({ subtotal, discount, shipping, total: calculateNetTotal(subtotal, discount, shipping) })
        .toEqual({ subtotal: 1650, discount: 82, shipping: 0, total: 1568 });
    });

    it('AC-6: SAVE10 below minSpend on P1 x 2 -> remove coupon, discount 45, shipping 25, total 880', () => {
      const lines = [{ price: 450, weightGram: 300, quantity: 2 }];
      const subtotal = calculateSubtotal(lines);
      const weightTier = shippableWeightTier(lines);
      const discountResult = calculateDiscount(subtotal, 'prime', { percent: 10, minSpend: 1000, active: true });
      const shipping = calculateShippingFee(weightTier, 'upcountry', 'express', 'prime');
      expect({ subtotal, ...discountResult, shipping, total: calculateNetTotal(subtotal, discountResult.discount, shipping) })
        .toEqual({ subtotal: 900, discount: 45, source: 'member', couponRemoved: true, shipping: 25, total: 880 });
    });

    it('AC-7: inactive SAVE10 on P2 x 1 for normal member -> remove coupon, shipping 30, total 1,230', () => {
      const lines = [{ price: 1200, weightGram: 900, quantity: 1 }];
      const subtotal = calculateSubtotal(lines);
      const weightTier = shippableWeightTier(lines);
      const discountResult = calculateDiscount(subtotal, 'normal', { percent: 10, minSpend: 1000, active: false });
      const shipping = calculateShippingFee(weightTier, 'inCity', 'standard', 'normal');
      expect({ subtotal, ...discountResult, shipping, total: calculateNetTotal(subtotal, discountResult.discount, shipping) })
        .toEqual({ subtotal: 1200, discount: 0, source: 'none', couponRemoved: true, shipping: 30, total: 1230 });
    });

    it('AC-8: normal member without coupon on P3 x 1 -> heavy remote express shipping 270, total 15,270', () => {
      const lines = [{ price: 15000, weightGram: 8000, quantity: 1 }];
      const subtotal = calculateSubtotal(lines);
      const weightTier = shippableWeightTier(lines);
      const { discount } = calculateDiscount(subtotal, 'normal', null);
      const shipping = calculateShippingFee(weightTier, 'remote', 'express', 'normal');
      expect({ subtotal, discount, shipping, total: calculateNetTotal(subtotal, discount, shipping) })
        .toEqual({ subtotal: 15000, discount: 0, shipping: 270, total: 15270 });
    });
  });
});

/**
 * FR: FR-5.1 และลำดับตรวจ 4 ขั้นใน FR-5.2.1
 * เทคนิค: ECT สำหรับ zone/speed และสถานะ line; BVA สำหรับน้ำหนัก 20,000/20,001g;
 * Decision Table/priority sequence สำหรับผลของขั้นที่ผิดก่อน
 */
describe('validateCheckout (FR-5.1–5.2.1)', () => {
  const validLine = { productId: 'P1', quantity: 1, available: true, availableStock: 10 };
  const zones = ['inCity', 'upcountry', 'remote'];
  const speeds = ['standard', 'express'];
  const invalidZones: unknown[] = ['', 'city', 'IN_CITY', null, undefined, 1, false];
  const invalidSpeeds: unknown[] = ['', 'overnight', 'EXPRESS', null, undefined, 1, false];

  it.each(zones.flatMap((zone) => speeds.map((speed) => ({ zone, speed }))))('accepts valid zone=$zone speed=$speed', ({ zone, speed }) => {
    expect(validateCheckout({ zone, speed, lines: [validLine], totalWeightGram: 1 })).toEqual({ result: 'OK' });
  });
  it.each(invalidZones.map((zone) => ({ zone })))('invalid zone $zone -> VALIDATION_ERROR', ({ zone }) => {
    expect(validateCheckout({ zone, speed: 'standard', lines: [validLine], totalWeightGram: 1 })).toEqual({ result: 'VALIDATION_ERROR' });
  });
  it.each(invalidSpeeds.map((speed) => ({ speed })))('invalid speed $speed -> VALIDATION_ERROR', ({ speed }) => {
    expect(validateCheckout({ zone: 'inCity', speed, lines: [validLine], totalWeightGram: 1 })).toEqual({ result: 'VALIDATION_ERROR' });
  });

  it.each([0, 1, 2, 3, 5, 10].map((count) => ({ count, result: count === 0 ? 'CART_EMPTY' : 'OK' })))('line count $count -> $result', ({ count, result }) => {
    const lines = Array.from({ length: count }, (_, index) => ({ ...validLine, productId: `P${index + 1}` }));
    expect(validateCheckout({ zone: 'inCity', speed: 'standard', lines, totalWeightGram: 300 })).toEqual({ result });
  });

  const availabilityCases = [
    { available: false, quantity: 1, stock: 10, expected: true },
    { available: true, quantity: 1, stock: 0, expected: true },
    { available: true, quantity: 3, stock: 2, expected: true },
    { available: true, quantity: 2, stock: 2, expected: false },
    { available: true, quantity: 1, stock: 10, expected: false },
  ];
  it.each(availabilityCases)('available=$available, quantity=$quantity, stock=$stock', ({ available, quantity, stock, expected }) => {
    const result = validateCheckout({
      zone: 'inCity', speed: 'standard',
      lines: [{ productId: 'P1', quantity, available, availableStock: stock }], totalWeightGram: 300,
    });
    expect(result).toEqual(expected ? { result: 'ITEMS_UNAVAILABLE', productIds: ['P1'] } : { result: 'OK' });
  });

  it.each([1, 2, 3, 5].map((count) => ({ count })))('returns every unavailable product ID in line order ($count lines)', ({ count }) => {
    const lines = Array.from({ length: count }, (_, index) => ({
      productId: `P${index + 1}`, quantity: 2, available: index % 2 === 1, availableStock: index % 2 === 1 ? 2 : 1,
    }));
    const expectedIds = lines.filter((line) => !line.available || line.quantity > line.availableStock).map((line) => line.productId);
    expect(validateCheckout({ zone: 'inCity', speed: 'standard', lines, totalWeightGram: 100 })).toEqual({ result: 'ITEMS_UNAVAILABLE', productIds: expectedIds });
  });

  const weightCases = [
    { grams: 1, expected: 'OK' }, { grams: 1000, expected: 'OK' }, { grams: 1001, expected: 'OK' },
    { grams: 5000, expected: 'OK' }, { grams: 5001, expected: 'OK' }, { grams: 20000, expected: 'OK' },
    { grams: 20001, expected: 'WEIGHT_LIMIT_EXCEEDED' }, { grams: 24000, expected: 'WEIGHT_LIMIT_EXCEEDED' },
  ] as const;
  it.each(weightCases)('total weight $grams -> $expected', ({ grams, expected }) => {
    expect(validateCheckout({ zone: 'inCity', speed: 'standard', lines: [validLine], totalWeightGram: grams })).toEqual({ result: expected });
  });

  it('checks invalid zone/speed before empty cart, unavailable items, and weight', () => {
    expect(validateCheckout({ zone: 'bad', speed: 'bad', lines: [{ ...validLine, available: false }], totalWeightGram: 24000 }))
      .toEqual({ result: 'VALIDATION_ERROR' });
  });
  it('checks empty cart before weight', () => {
    expect(validateCheckout({ zone: 'inCity', speed: 'standard', lines: [], totalWeightGram: 24000 }))
      .toEqual({ result: 'CART_EMPTY' });
  });
  it('checks item availability before weight', () => {
    expect(validateCheckout({ zone: 'inCity', speed: 'standard', lines: [{ ...validLine, available: false }], totalWeightGram: 24000 }))
      .toEqual({ result: 'ITEMS_UNAVAILABLE', productIds: ['P1'] });
  });
});

/**
 * FR: FR-9.1.1 ขั้นตรวจ price/stock
 * เทคนิค: ECT สำหรับชนิดข้อมูลที่ถูก/ผิด; BVA ที่ price 1/50,000 และ stock 0/9,999;
 * Decision Table สำหรับผลเมื่อระบุหนึ่งฟิลด์หรือสองฟิลด์ที่ผิดพร้อมกัน
 */
describe('validateProductUpdate (FR-9.1.1)', () => {
  it('requires at least price or stock', () => {
    expect(validateProductUpdate({})).toEqual(['price', 'stock']);
  });
  it('accepts price-only and stock-only updates', () => {
    expect(validateProductUpdate({ price: 450 })).toEqual([]);
    expect(validateProductUpdate({ stock: 20 })).toEqual([]);
  });

  const priceCases = [
    { value: 1, valid: true }, { value: 2, valid: true }, { value: 49999, valid: true }, { value: 50000, valid: true },
    { value: 0, valid: false }, { value: -1, valid: false }, { value: 50001, valid: false }, { value: 1.5, valid: false },
    { value: '450', valid: false }, { value: null, valid: false }, { value: NaN, valid: false },
  ];
  it.each(priceCases)('price=$value valid=$valid', ({ value, valid }) => {
    expect(validateProductUpdate({ price: value })).toEqual(valid ? [] : ['price']);
  });

  const stockCases = [
    { value: 0, valid: true }, { value: 1, valid: true }, { value: 9998, valid: true }, { value: 9999, valid: true },
    { value: -1, valid: false }, { value: 10000, valid: false }, { value: 1.5, valid: false },
    { value: '20', valid: false }, { value: null, valid: false }, { value: NaN, valid: false },
  ];
  it.each(stockCases)('stock=$value valid=$valid', ({ value, valid }) => {
    expect(validateProductUpdate({ stock: value })).toEqual(valid ? [] : ['stock']);
  });

  const combinedCases = [
    { price: 0, stock: 10000, expected: ['price', 'stock'] },
    { price: 0, stock: 5, expected: ['price'] },
    { price: 500, stock: -1, expected: ['stock'] },
    { price: 1, stock: 0, expected: [] },
    { price: 50000, stock: 9999, expected: [] },
  ];
  it.each(combinedCases)('price=$price stock=$stock -> $expected', ({ price, stock, expected }) => {
    expect(validateProductUpdate({ price, stock })).toEqual(expected);
  });
});
