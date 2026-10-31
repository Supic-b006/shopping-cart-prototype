const texts: Record<string,string> = {
 AUTH_INVALID_CREDENTIALS:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', AUTH_REQUIRED:'กรุณาเข้าสู่ระบบ', AUTH_FORBIDDEN:'ไม่มีสิทธิ์ดำเนินการ',
 VALIDATION_ERROR:'ข้อมูลไม่ถูกต้อง', QTY_OUT_OF_RANGE:'จำนวนต้องอยู่ระหว่าง 1–10', PRODUCT_NOT_FOUND:'ไม่พบสินค้า',
 PRODUCT_UNAVAILABLE:'สินค้าไม่พร้อมขาย', INSUFFICIENT_STOCK:'สต็อกสินค้าไม่เพียงพอ', ITEM_NOT_IN_CART:'ไม่พบสินค้าในตะกร้า',
 CART_EMPTY:'ไม่สามารถชำระเงินได้ ตะกร้าว่าง', COUPON_INVALID:'คูปองไม่ถูกต้องหรือปิดใช้', ITEMS_UNAVAILABLE:'มีสินค้าไม่พร้อมขายในตะกร้า',
 WEIGHT_LIMIT_EXCEEDED:'น้ำหนักรวมเกิน 20,000 กรัม', OPERATION_NOT_ALLOWED:'ไม่สามารถดำเนินการในขั้นตอนนี้', ORDER_NOT_FOUND:'ไม่พบออเดอร์', COUPON_NOT_FOUND:'ไม่พบคูปอง'
};
export class DomainError extends Error {
  constructor(public code: string, public details: Record<string,unknown> = {}, message?: string) { super(message ?? texts[code] ?? code); }
  get status(): number {
    if (this.code === 'AUTH_REQUIRED' || this.code === 'AUTH_INVALID_CREDENTIALS') return 401;
    if (this.code === 'AUTH_FORBIDDEN') return 403;
    if (['PRODUCT_NOT_FOUND','ORDER_NOT_FOUND','COUPON_NOT_FOUND'].includes(this.code)) return 404;
    if (this.code === 'VALIDATION_ERROR' || this.code === 'QTY_OUT_OF_RANGE') return 400;
    return 409;
  }
}
export function ensure(ok: unknown, code: string, details: Record<string,unknown> = {}, message?: string): asserts ok {
  if (!ok) throw new DomainError(code, details, message);
}
