/**
 * pure-functions สำหรับระบบ Multi-User Shopping Cart & Checkout
 * ปฏิบัติตามข้อกำหนดการออกแบบ DC-1 (SRS-CART-002_v1.8)
 */

export type Zone = 'inCity' | 'upcountry' | 'remote';
export type Speed = 'standard' | 'express';
export type MemberTier = 'normal' | 'prime';
export type WeightTier = 'light' | 'medium' | 'heavy' | 'overLimit';

export type CartLine = {
  productId: string;
  price: number;
  weightGram?: number;
  quantity: number;
};

// ==========================================
// กลุ่มที่ 1: สินค้าและตะกร้า (FR-1.3.1, FR-2)
// ==========================================

/**
 * นิยาม "สินค้าพร้อมขาย" (ส่วนที่ 2) — ใช้ใน FR-1.3.1, 2.2.2, 2.5.4, 2.9, 5.2.1
 * สินค้าที่มีสถานะ เปิดขาย (isOnSale = true) และ สต็อกพร้อมขาย >= 1
 */
export function isProductAvailable(isOnSale: boolean, availableStock: number): boolean {
  return isOnSale && availableStock >= 1;
}

/**
 * FR-2.1, 2.2, 2.4, 2.5.1–2.5.5 ตามลำดับการตรวจของ FR-2.6
 * คืนค่า error code ของขั้นแรกที่ไม่ผ่าน หรือ 'OK'
 */
export function validateQuantityChange(input: {
  operation: 'add' | 'update';
  quantity: unknown;          // ค่าที่ได้รับจาก request (อาจไม่ใช่จำนวนเต็ม)
  productExists: boolean;     // ใช้เมื่อ operation = 'add' (ขั้น 3)
  inCart: boolean;            // ใช้เมื่อ operation = 'update' (ขั้น 3)
  available: boolean;         // ผลของ isProductAvailable (ขั้น 4)
  currentQtyInCart: number;   // 0 เมื่อสินค้ายังไม่อยู่ในตะกร้า (ขั้น 5–6)
  availableStock: number;     // ขั้น 6
}): 'OK' | 'VALIDATION_ERROR' | 'QTY_OUT_OF_RANGE' | 'PRODUCT_NOT_FOUND'
   | 'ITEM_NOT_IN_CART' | 'PRODUCT_UNAVAILABLE' | 'INSUFFICIENT_STOCK' {
  const { operation, quantity, productExists, inCart, available, currentQtyInCart, availableStock } = input;

  // ขั้นที่ 1: quantity เป็นจำนวนเต็ม (VALIDATION_ERROR)
  if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
    return 'VALIDATION_ERROR';
  }

  // ขั้นที่ 2: quantity ที่ระบุอยู่ในช่วง 1–10 (QTY_OUT_OF_RANGE)
  if (quantity < 1 || quantity > 10) {
    return 'QTY_OUT_OF_RANGE';
  }

  // ขั้นที่ 3: เช็คการมีอยู่ของสินค้า หรือการมีอยู่ในตะกร้า
  if (operation === 'add') {
    if (!productExists) {
      return 'PRODUCT_NOT_FOUND';
    }
  } else if (operation === 'update') {
    if (!inCart) {
      return 'ITEM_NOT_IN_CART';
    }
  }

  // ขั้นที่ 4: สินค้าเป็นสินค้าพร้อมขาย (PRODUCT_UNAVAILABLE)
  if (!available) {
    return 'PRODUCT_UNAVAILABLE';
  }

  // คำนวณ quantity สุทธิที่จะอยู่ในตะกร้าหลังดำเนินการ
  const targetQty = operation === 'add' ? currentQtyInCart + quantity : quantity;

  // ขั้นที่ 5: เฉพาะ addItem: quantity รวมหลังเพิ่มไม่เกิน 10 (QTY_OUT_OF_RANGE)
  if (operation === 'add' && targetQty > 10) {
    return 'QTY_OUT_OF_RANGE';
  }

  // ขั้นที่ 6: quantity ของรายการหลังดำเนินการไม่เกินสต็อกพร้อมขาย (INSUFFICIENT_STOCK)
  if (targetQty > availableStock) {
    return 'INSUFFICIENT_STOCK';
  }

  return 'OK';
}

// ==========================================
// กลุ่มที่ 2: การคำนวณราคา (FR-4)
// ==========================================

/**
 * FR-4.1 ยอดรวมสินค้า (subtotal) = Σ (ราคาต่อชิ้น × quantity)
 */
export function calculateSubtotal(lines: { price: number; quantity: number }[]): number {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
}

/**
 * นิยาม "น้ำหนักรวม" (ส่วนที่ 2) = Σ (น้ำหนักต่อชิ้น × quantity)
 */
export function calculateTotalWeight(lines: { weightGram: number; quantity: number }[]): number {
  return lines.reduce((sum, line) => sum + line.weightGram * line.quantity, 0);
}

/**
 * FR-4.2 – FR-4.4 การคำนวณส่วนลด
 */
export function calculateDiscount(
  subtotal: number,
  memberTier: MemberTier,
  coupon: { percent: number; minSpend: number; active: boolean } | null
): { discount: number; source: 'coupon' | 'member' | 'none'; couponRemoved: boolean } {
  // ตรวจสอบเงื่อนไขคูปอง
  if (coupon) {
    if (!coupon.active || subtotal < coupon.minSpend) {
      // FR-4.3.1: ถอดคูปองออก
      // FR-4.4: เมื่อถอดคูปอง ให้คำนวณส่วนลดสมาชิกแทน
      const memberDiscount = memberTier === 'prime' ? Math.floor((subtotal * 5) / 100) : 0;
      return {
        discount: memberDiscount,
        source: memberDiscount > 0 ? 'member' : 'none',
        couponRemoved: true,
      };
    } else {
      // FR-4.2.1: ให้ส่วนลดคูปอง floor(subtotal * percent / 100)
      const couponDiscount = Math.floor((subtotal * coupon.percent) / 100);
      return {
        discount: couponDiscount,
        source: 'coupon',
        couponRemoved: false,
      };
    }
  }

  // FR-4.4: กรณีไม่มีคูปองผูกอยู่
  const memberDiscount = memberTier === 'prime' ? Math.floor((subtotal * 5) / 100) : 0;
  return {
    discount: memberDiscount,
    source: memberDiscount > 0 ? 'member' : 'none',
    couponRemoved: false,
  };
}

/**
 * FR-4.5 การจัดระดับน้ำหนัก (weightTier)
 */
export function classifyWeight(totalWeightGram: number): WeightTier {
  if (totalWeightGram >= 1 && totalWeightGram <= 1000) {
    return 'light';
  }
  if (totalWeightGram >= 1001 && totalWeightGram <= 5000) {
    return 'medium';
  }
  if (totalWeightGram >= 5001 && totalWeightGram <= 20000) {
    return 'heavy';
  }
  return 'overLimit';
}

/**
 * FR-4.6, FR-4.7 การคำนวณค่าจัดส่ง
 */
export function calculateShippingFee(
  weightTier: Exclude<WeightTier, 'overLimit'>,
  zone: Zone,
  speed: Speed,
  memberTier: MemberTier
): number {
  const baseRateTable: Record<Exclude<WeightTier, 'overLimit'>, Record<Zone, number>> = {
    light: { inCity: 30, upcountry: 50, remote: 80 },
    medium: { inCity: 50, upcountry: 80, remote: 120 },
    heavy: { inCity: 80, upcountry: 120, remote: 180 },
  };

  const baseRate = baseRateTable[weightTier][zone];

  if (memberTier === 'prime') {
    // Prime: standard = 0, express = baseRate * 1 / 2 ( floor )
    return speed === 'standard' ? 0 : Math.floor((baseRate * 1) / 2);
  } else {
    // Normal: standard = baseRate, express = baseRate * 3 / 2 ( floor )
    return speed === 'standard' ? baseRate : Math.floor((baseRate * 3) / 2);
  }
}

/**
 * FR-4.8 ยอดชำระสุทธิ = ยอดรวมสินค้า - ส่วนลด + ค่าจัดส่ง
 */
export function calculateNetTotal(subtotal: number, discount: number, shippingFee: number): number {
  return subtotal - discount + shippingFee;
}

// ==========================================
// กลุ่มที่ 3: การตรวจสอบก่อน checkout (FR-5)
// ==========================================

/**
 * FR-5.1, FR-5.2.1 — ตรวจ 4 ขั้นตามลำดับ และคืนผลของขั้นแรกที่ไม่ผ่าน
 */
export function validateCheckout(input: {
  zone: unknown;
  speed: unknown;
  lines: { productId: string; quantity: number; available: boolean; availableStock: number }[];
  totalWeightGram: number;
}):
  | { result: 'OK' }
  | { result: 'VALIDATION_ERROR' | 'CART_EMPTY' | 'WEIGHT_LIMIT_EXCEEDED' }
  | { result: 'ITEMS_UNAVAILABLE'; productIds: string[] } {
  const { zone, speed, lines, totalWeightGram } = input;

  // ขั้นที่ 1: zone และ speed ถูกต้องตาม FR-5.1
  const validZones: Zone[] = ['inCity', 'upcountry', 'remote'];
  const validSpeeds: Speed[] = ['standard', 'express'];

  if (
    typeof zone !== 'string' ||
    !validZones.includes(zone as Zone) ||
    typeof speed !== 'string' ||
    !validSpeeds.includes(speed as Speed)
  ) {
    return { result: 'VALIDATION_ERROR' };
  }

  // ขั้นที่ 2: ตะกร้ามีอย่างน้อยหนึ่งรายการ
  if (lines.length === 0) {
    return { result: 'CART_EMPTY' };
  }

  // ขั้นที่ 3: ทุกรายการเป็นสินค้าพร้อมขาย และ quantity ไม่เกินสต็อกพร้อมขาย
  const unavailableProductIds: string[] = [];
  for (const line of lines) {
    if (!line.available || line.quantity > line.availableStock) {
      unavailableProductIds.push(line.productId);
    }
  }

  if (unavailableProductIds.length > 0) {
    return { result: 'ITEMS_UNAVAILABLE', productIds: unavailableProductIds };
  }

  // ขั้นที่ 4: น้ำหนักรวมไม่เกิน 20,000 กรัม
  if (totalWeightGram > 20000) {
    return { result: 'WEIGHT_LIMIT_EXCEEDED' };
  }

  return { result: 'OK' };
}

// ==========================================
// กลุ่มที่ 4: การจัดการสินค้า (Admin) (FR-9.1)
// ==========================================

/**
 * FR-9.1.1 ขั้น 2 ตรวจสอบค่า price และ stock ที่ระบุ
 * คืนรายชื่อฟิลด์ที่ไม่ผ่านทั้งหมด — array ว่าง หมายถึงผ่าน
 */
export function validateProductUpdate(input: { price?: unknown; stock?: unknown }): ('price' | 'stock')[] {
  const invalidFields: ('price' | 'stock')[] = [];
  const { price, stock } = input;

  // ต้องระบุอย่างน้อยหนึ่งค่า
  if (price === undefined && stock === undefined) {
    invalidFields.push('price', 'stock');
    return invalidFields;
  }

  // ตรวจสอบ price (ถ้าระบุ ต้องเป็นจำนวนเต็ม 1 ถึง 50,000)
  if (price !== undefined) {
    if (typeof price !== 'number' || !Number.isInteger(price) || price < 1 || price > 50000) {
      invalidFields.push('price');
    }
  }

  // ตรวจสอบ stock (ถ้าระบุ ต้องเป็นจำนวนเต็ม 0 ถึง 9,999)
  if (stock !== undefined) {
    if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0 || stock > 9999) {
      invalidFields.push('stock');
    }
  }

  return invalidFields;
}
// ```

// eof

// ---

// ### รายละเอียดเพิ่มเติมของไฟล์ `cartSerive.ts`
// 1. **เป็น Pure Functions 100%:** ไม่มีส่วนใดที่เข้าถึง Database, ทำ HTTP Request หรือดึงระบบเวลาจริง