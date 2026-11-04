import { describe, it, expect } from 'vitest';
import {
  isProductAvailable,
  validateQuantityChange,
  calculateSubtotal,
  calculateTotalWeight,
  calculateDiscount,
  classifyWeight,
  calculateShippingFee,
  calculateNetTotal,
  validateCheckout,
  validateProductUpdate,
} from '../src/cartService'; // หรือ './cartLogic' ตามชื่อไฟล์หลักของคุณ

// ============================================================================
// กลุ่มที่ 1: สินค้าและตะกร้า (Product & Cart)
// ============================================================================

describe('isProductAvailable', () => {
  /**
   * เทคนิคที่ใช้: Equivalence Class Testing (ECT)
   * อ้างอิง SRS: ส่วนที่ 2 (นิยาม สินค้าพร้อมขาย: สถานะเปิดขาย และ สต็อกพร้อมขาย >= 1)
   */
  it('[ECT] ควรคืนค่า true เมื่อสินค้าเปิดขายและสต็อก >= 1', () => {
    expect(isProductAvailable(true, 5)).toBe(true);
  });

  it('[ECT] ควรคืนค่า false เมื่อสินค้าปิดขาย', () => {
    expect(isProductAvailable(false, 5)).toBe(false);
  });

  /**
   * เทคนิคที่ใช้: Boundary Value Analysis (BVA)
   * อ้างอิง SRS: ส่วนที่ 2 (จุดขอบของสต็อกพร้อมขาย: 0 vs 1)
   */
  it('[BVA] ควรคืนค่า false เมื่อสต็อกเป็น 0 (จุดขอบ)', () => {
    expect(isProductAvailable(true, 0)).toBe(false);
  });
});

describe('validateQuantityChange', () => {
  /**
   * เทคนิคที่ใช้: Equivalence Class Testing (ECT) & Decision Table Testing
   * อ้างอิง SRS: FR-2.1, FR-2.2, FR-2.4, FR-2.5, FR-2.6 (ลำดับการตรวจ 6 ขั้นตอน)
   */

  // ขั้นที่ 1: quantity เป็นจำนวนเต็ม
  it('[ECT] ขั้น 1: คืนค่า VALIDATION_ERROR เมื่อ quantity ไม่ใช่จำนวนเต็ม', () => {
    const result = validateQuantityChange({
      operation: 'add',
      quantity: 2.5,
      productExists: true,
      inCart: false,
      available: true,
      currentQtyInCart: 0,
      availableStock: 10,
    });
    expect(result).toBe('VALIDATION_ERROR');
  });

  // ขั้นที่ 2: quantity อยู่นอกช่วง 1-10
  it('[BVA] ขั้น 2: คืนค่า QTY_OUT_OF_RANGE เมื่อ quantity น้อยกว่า 1 (เช่น 0)', () => {
    const result = validateQuantityChange({
      operation: 'add',
      quantity: 0,
      productExists: true,
      inCart: false,
      available: true,
      currentQtyInCart: 0,
      availableStock: 10,
    });
    expect(result).toBe('QTY_OUT_OF_RANGE');
  });

  it('[BVA] ขั้น 2: คืนค่า QTY_OUT_OF_RANGE เมื่อ quantity เกิน 10 (เช่น 11)', () => {
    const result = validateQuantityChange({
      operation: 'add',
      quantity: 11,
      productExists: true,
      inCart: false,
      available: true,
      currentQtyInCart: 0,
      availableStock: 20,
    });
    expect(result).toBe('QTY_OUT_OF_RANGE');
  });

  // ขั้นที่ 3: ความมีอยู่ของสินค้า / ในตะกร้า
  it('[ECT] ขั้น 3 (add): คืนค่า PRODUCT_NOT_FOUND เมื่อไม่มีสินค้าในระบบ', () => {
    const result = validateQuantityChange({
      operation: 'add',
      quantity: 2,
      productExists: false,
      inCart: false,
      available: true,
      currentQtyInCart: 0,
      availableStock: 10,
    });
    expect(result).toBe('PRODUCT_NOT_FOUND');
  });

  it('[ECT] ขั้น 3 (update): คืนค่า ITEM_NOT_IN_CART เมื่อสินค้าไม่อยู่ในตะกร้า', () => {
    const result = validateQuantityChange({
      operation: 'update',
      quantity: 2,
      productExists: true,
      inCart: false,
      available: true,
      currentQtyInCart: 0,
      availableStock: 10,
    });
    expect(result).toBe('ITEM_NOT_IN_CART');
  });

  // ขั้นที่ 4: สินค้าเป็นสินค้าพร้อมขาย
  it('[ECT] ขั้น 4: คืนค่า PRODUCT_UNAVAILABLE เมื่อสินค้าไม่พร้อมขาย', () => {
    const result = validateQuantityChange({
      operation: 'add',
      quantity: 2,
      productExists: true,
      inCart: false,
      available: false,
      currentQtyInCart: 0,
      availableStock: 10,
    });
    expect(result).toBe('PRODUCT_UNAVAILABLE');
  });

  // ขั้นที่ 5: quantity รวมหลัง addItem ไม่เกิน 10
  it('[BVA/AC-2] ขั้น 5: คืนค่า QTY_OUT_OF_RANGE เมื่อ quantity รวมหลังเพิ่มเกิน 10 (มี 8 เพิ่ม 3 = 11)', () => {
    const result = validateQuantityChange({
      operation: 'add',
      quantity: 3,
      productExists: true,
      inCart: true,
      available: true,
      currentQtyInCart: 8,
      availableStock: 20,
    });
    expect(result).toBe('QTY_OUT_OF_RANGE');
  });

  // ขั้นที่ 6: quantity ไม่เกินสต็อกพร้อมขาย
  it('[BVA/AC-3] ขั้น 6: คืนค่า INSUFFICIENT_STOCK เมื่อ quantity เกินสต็อก (มี 2 สต็อกมี 3 เพิ่ม 2 = 4)', () => {
    const result = validateQuantityChange({
      operation: 'add',
      quantity: 2,
      productExists: true,
      inCart: true,
      available: true,
      currentQtyInCart: 2,
      availableStock: 3,
    });
    expect(result).toBe('INSUFFICIENT_STOCK');
  });

  it('[ECT] คืนค่า OK เมื่อผ่านการตรวจสอบทุกขั้นตอน', () => {
    const result = validateQuantityChange({
      operation: 'add',
      quantity: 2,
      productExists: true,
      inCart: false,
      available: true,
      currentQtyInCart: 0,
      availableStock: 5,
    });
    expect(result).toBe('OK');
  });
});

// ============================================================================
// กลุ่มที่ 2: การคำนวณราคา (Price Calculation)
// ============================================================================

describe('calculateSubtotal & calculateTotalWeight', () => {
  /**
   * เทคนิคที่ใช้: Equivalence Class Testing (ECT)
   * อ้างอิง SRS: FR-4.1 และ นิยามในส่วนที่ 2
   */
  it('[ECT] คำนวณยอดรวมสินค้า (subtotal) ได้ถูกต้อง', () => {
    const lines = [
      { price: 450, quantity: 2 },  // 900
      { price: 1200, quantity: 1 }, // 1200
    ];
    expect(calculateSubtotal(lines)).toBe(2100);
  });

  it('[ECT] คำนวณน้ำหนักรวม (totalWeightGram) ได้ถูกต้อง', () => {
    const lines = [
      { weightGram: 300, quantity: 2 }, // 600
      { weightGram: 900, quantity: 1 }, // 900
    ];
    expect(calculateTotalWeight(lines)).toBe(1500);
  });
});

describe('calculateDiscount', () => {
  /**
   * เทคนิคที่ใช้: Decision Table Testing (อ้างอิง ตารางเฉลยส่วนที่ 10.3 ใน SRS)
   * เงื่อนไข: C1=มีคูปอง, C2=คูปองเปิดใช้, C3=ยอดรวม >= minSpend, C4=memberTier เป็น prime
   */

  // Rule 1: ไม่มีคูปอง, normal -> ไม่มีส่วนลด
  it('[Decision Table R1] ไม่มีคูปอง, สมาชิก normal -> ส่วนลด 0, source: none', () => {
    const res = calculateDiscount(1000, 'normal', null);
    expect(res).toEqual({ discount: 0, source: 'none', couponRemoved: false });
  });

  // Rule 2 / AC-5: ไม่มีคูปอง, prime -> ส่วนลดสมาชิก 5% (พร้อมปัดเศษลง)
  it('[Decision Table R2 / AC-5] ไม่มีคูปอง, สมาชิก prime (ยอด 1650) -> ส่วนลด 82 บาท (floor(82.5))', () => {
    const res = calculateDiscount(1650, 'prime', null);
    expect(res).toEqual({ discount: 82, source: 'member', couponRemoved: false });
  });

  // Rule 3/4: มีคูปอง แต่ปิดใช้งาน -> ถอดคูปอง คิดส่วนลดสมาชิกตาม tier
  it('[Decision Table R3/R4 / AC-7] คูปองปิดใช้, prime -> ถอดคูปอง + ส่วนลดสมาชิก 5%', () => {
    const coupon = { percent: 10, minSpend: 1000, active: false };
    const res = calculateDiscount(1650, 'prime', coupon);
    expect(res).toEqual({ discount: 82, source: 'member', couponRemoved: true });
  });

  // Rule 5/6: มีคูปองเปิดใช้ ยอดไม่ถึง minSpend -> ถอดคูปอง คิดส่วนลดสมาชิกตาม tier
  it('[Decision Table R5/R6 / AC-6] คูปองเปิดใช้ ยอดรวมไม่ถึง minSpend (ยอด 900 < 1000) -> ถอดคูปอง + ส่วนลดสมาชิก', () => {
    const coupon = { percent: 10, minSpend: 1000, active: true };
    const res = calculateDiscount(900, 'prime', coupon);
    expect(res).toEqual({ discount: 45, source: 'member', couponRemoved: true }); // floor(900 * 5%) = 45
  });

  // Rule 7 / AC-4: คูปองเปิดใช้ ยอดรวมถึง minSpend -> ใช้ส่วนลดคูปอง (ไม่ทบส่วนลดสมาชิก)
  it('[Decision Table R7 / AC-4] คูปองเปิดใช้ ยอดถึง minSpend -> ได้ส่วนลดคูปอง 10% (ไม่ทบส่วนลดสมาชิก)', () => {
    const coupon = { percent: 10, minSpend: 1000, active: true };
    const res = calculateDiscount(1650, 'prime', coupon);
    expect(res).toEqual({ discount: 165, source: 'coupon', couponRemoved: false }); // floor(1650 * 10%) = 165
  });
});

describe('classifyWeight', () => {
  /**
   * เทคนิคที่ใช้: Boundary Value Analysis (BVA)
   * อ้างอิง SRS: FR-4.5 (ช่วงน้ำหนัก: 1-1,000 / 1,001-5,000 / 5,001-20,000 / >20,000)
   */
  it('[BVA] 1,000g -> light', () => {
    expect(classifyWeight(1000)).toBe('light');
  });

  it('[BVA] 1,001g -> medium', () => {
    expect(classifyWeight(1001)).toBe('medium');
  });

  it('[BVA] 5,000g -> medium', () => {
    expect(classifyWeight(5000)).toBe('medium');
  });

  it('[BVA] 5,001g -> heavy', () => {
    expect(classifyWeight(5001)).toBe('heavy');
  });

  it('[BVA] 20,000g -> heavy', () => {
    expect(classifyWeight(20000)).toBe('heavy');
  });

  it('[BVA] 20,001g -> overLimit', () => {
    expect(classifyWeight(20001)).toBe('overLimit');
  });
});

describe('calculateShippingFee', () => {
  /**
   * เทคนิคที่ใช้: Pairwise / Equivalence Class Testing (ECT)
   * อ้างอิง SRS: FR-4.6, FR-4.7
   */
  it('[ECT / AC-4] light, inCity, standard, prime -> 0 บาท (prime standard ส่งฟรี)', () => {
    expect(calculateShippingFee('light', 'inCity', 'standard', 'prime')).toBe(0);
  });

  it('[ECT / AC-6] light, upcountry, express, prime -> 25 บาท (base 50 * 1/2 = 25)', () => {
    expect(calculateShippingFee('light', 'upcountry', 'express', 'prime')).toBe(25);
  });

  it('[ECT / AC-8] heavy, remote, express, normal -> 270 บาท (base 180 * 3/2 = 270)', () => {
    expect(calculateShippingFee('heavy', 'remote', 'express', 'normal')).toBe(270);
  });

  it('[ECT / AC-7] light, inCity, standard, normal -> 30 บาท (base rate 30)', () => {
    expect(calculateShippingFee('light', 'inCity', 'standard', 'normal')).toBe(30);
  });
});

describe('calculateNetTotal', () => {
  /**
   * เทคนิคที่ใช้: Equivalence Class Testing (ECT)
   * อ้างอิง SRS: FR-4.8 (ยอดสุทธิ = ยอดรวม - ส่วนลด + ค่าส่ง)
   */
  it('[ECT] คำนวณยอดชำระสุทธิตามสูตรถูกต้อง', () => {
    expect(calculateNetTotal(1650, 165, 0)).toBe(1485);
  });
});

// ============================================================================
// กลุ่มที่ 3: การตรวจสอบก่อน Checkout
// ============================================================================

describe('validateCheckout', () => {
  /**
   * เทคนิคที่ใช้: Decision Table & Priority Sequence Testing
   * อ้างอิง SRS: FR-5.1, FR-5.2.1 (ลำดับการตรวจ 4 ขั้นตอน)
   */

  // ขั้นที่ 1: Validation Error สำหรับ zone/speed
  it('[ECT] ขั้น 1: คืนค่า VALIDATION_ERROR เมื่อ zone หรือ speed ไม่ถูกต้อง', () => {
    const res = validateCheckout({
      zone: 'invalidZone',
      speed: 'standard',
      lines: [{ productId: 'P1', quantity: 1, available: true, availableStock: 10 }],
      totalWeightGram: 300,
    });
    expect(res).toEqual({ result: 'VALIDATION_ERROR' });
  });

  // ขั้นที่ 2: ตะกร้าว่าง
  it('[ECT] ขั้น 2: คืนค่า CART_EMPTY เมื่อตะกร้าไม่มีสินค้า', () => {
    const res = validateCheckout({
      zone: 'inCity',
      speed: 'standard',
      lines: [],
      totalWeightGram: 0,
    });
    expect(res).toEqual({ result: 'CART_EMPTY' });
  });

  // ขั้นที่ 3: สินค้าไม่พร้อมขาย / สต็อกไม่พอ
  it('[ECT/AC-10] ขั้น 3: คืนค่า ITEMS_UNAVAILABLE พร้อมรายชื่อ productId ที่ไม่ผ่าน', () => {
    const res = validateCheckout({
      zone: 'inCity',
      speed: 'standard',
      lines: [
        { productId: 'P1', quantity: 1, available: false, availableStock: 10 },
        { productId: 'P2', quantity: 5, available: true, availableStock: 3 }, // สต็อกไม่พอ
      ],
      totalWeightGram: 1200,
    });
    expect(res).toEqual({
      result: 'ITEMS_UNAVAILABLE',
      productIds: ['P1', 'P2'],
    });
  });

  // ขั้นที่ 4: น้ำหนักเกิน 20,000 กรัม
  it('[BVA/AC-9] ขั้น 4: คืนค่า WEIGHT_LIMIT_EXCEEDED เมื่อน้ำหนักรวมเกิน 20,000g', () => {
    const res = validateCheckout({
      zone: 'inCity',
      speed: 'standard',
      lines: [{ productId: 'P3', quantity: 3, available: true, availableStock: 5 }],
      totalWeightGram: 24000,
    });
    expect(res).toEqual({ result: 'WEIGHT_LIMIT_EXCEEDED' });
  });

  it('[ECT] คืนค่า OK เมื่อผ่านการตรวจสอบก่อน Checkout ทุกขั้นตอน', () => {
    const res = validateCheckout({
      zone: 'inCity',
      speed: 'standard',
      lines: [{ productId: 'P1', quantity: 1, available: true, availableStock: 10 }],
      totalWeightGram: 300,
    });
    expect(res).toEqual({ result: 'OK' });
  });
});

// ============================================================================
// กลุ่มที่ 4: การจัดการสินค้า (Admin)
// ============================================================================

describe('validateProductUpdate', () => {
  /**
   * เทคนิคที่ใช้: Boundary Value Analysis (BVA) & Equivalence Class Testing (ECT)
   * อ้างอิง SRS: FR-9.1.1 ขั้น 2 (ราคา 1-50,000 บาท, สต็อก 0-9,999 ชิ้น)
   */
  it('[ECT] คืน array ว่างเมื่อค่า price และ stock ถูกต้อง', () => {
    expect(validateProductUpdate({ price: 500, stock: 10 })).toEqual([]);
  });

  it('[BVA/AC-16] คืนค่าฟิลด์ที่ไม่ผ่านทั้งหมด [price, stock] เมื่อทั้งสองค่าหลุดช่วง', () => {
    const res = validateProductUpdate({ price: 0, stock: 10000 });
    expect(res).toEqual(['price', 'stock']);
  });

  it('[BVA] คืนค่า [price] เมื่อราคาไม่ใช่จำนวนเต็ม', () => {
    expect(validateProductUpdate({ price: 450.55 })).toEqual(['price']);
  });

  it('[BVA] คืนค่า [stock] เมื่อสต็อกติดลบ', () => {
    expect(validateProductUpdate({ stock: -1 })).toEqual(['stock']);
  });
});