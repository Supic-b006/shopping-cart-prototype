import type { Zone, Speed, MemberTier, WeightTier } from './types.js';
export type { Zone, Speed, MemberTier, WeightTier } from './types.js';
// DC-1: no I/O, clock, shared mutable state or numeric coercion.
export function isProductAvailable(isOnSale: boolean, availableStock: number): boolean {
  return isOnSale && availableStock >= 1;
}
export function validateQuantityChange(input: {
  operation: 'add' | 'update'; quantity: unknown; productExists: boolean;
  inCart: boolean; available: boolean; currentQtyInCart: number; availableStock: number;
}): 'OK' | 'VALIDATION_ERROR' | 'QTY_OUT_OF_RANGE' | 'PRODUCT_NOT_FOUND' | 'ITEM_NOT_IN_CART' | 'PRODUCT_UNAVAILABLE' | 'INSUFFICIENT_STOCK' {
  const q = input.quantity;
  if (typeof q !== 'number' || !Number.isInteger(q)) return 'VALIDATION_ERROR';
  if (q < 1 || q > 10) return 'QTY_OUT_OF_RANGE';
  if (input.operation === 'add' ? !input.productExists : !input.inCart)
    return input.operation === 'add' ? 'PRODUCT_NOT_FOUND' : 'ITEM_NOT_IN_CART';
  if (!input.available) return 'PRODUCT_UNAVAILABLE';
  const next = q + (input.operation === 'add' ? input.currentQtyInCart : 0);
  if (next > 10) return 'QTY_OUT_OF_RANGE';
  return next > input.availableStock ? 'INSUFFICIENT_STOCK' : 'OK';
}
export function calculateSubtotal(lines: {price: number; quantity: number}[]): number {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
}
export function calculateTotalWeight(lines: {weightGram: number; quantity: number}[]): number {
  return lines.reduce((sum, line) => sum + line.weightGram * line.quantity, 0);
}
export function calculateDiscount(subtotal: number, memberTier: MemberTier,
  coupon: {percent: number; minSpend: number; active: boolean} | null
): {discount: number; source: 'coupon' | 'member' | 'none'; couponRemoved: boolean} {
  if (coupon?.active && subtotal >= coupon.minSpend)
    return {discount: Math.floor(subtotal * coupon.percent / 100), source:'coupon', couponRemoved:false};
  return {discount: memberTier === 'prime' ? Math.floor(subtotal * 5 / 100) : 0,
    source: memberTier === 'prime' ? 'member' : 'none', couponRemoved: coupon !== null};
}
export function classifyWeight(totalWeightGram: number): WeightTier {
  // Empty cart (0g) is rejected by validateCheckout before pricing.
  return totalWeightGram <= 1000 ? 'light' : totalWeightGram <= 5000 ? 'medium' : totalWeightGram <= 20000 ? 'heavy' : 'overLimit';
}
export function calculateShippingFee(weightTier: Exclude<WeightTier, 'overLimit'>, zone: Zone, speed: Speed, memberTier: MemberTier): number {
  const rates = {light:{inCity:30,upcountry:50,remote:80},medium:{inCity:50,upcountry:80,remote:120},heavy:{inCity:80,upcountry:120,remote:180}};
  const base = rates[weightTier][zone];
  return Math.floor(base * (memberTier === 'prime' ? (speed === 'standard' ? 0 : .5) : (speed === 'standard' ? 1 : 1.5)));
}
export function calculateNetTotal(subtotal: number, discount: number, shippingFee: number): number {
  return subtotal - discount + shippingFee;
}
export function validateCheckout(input: {zone: unknown; speed: unknown; lines: {productId: string; quantity: number; available: boolean; availableStock: number}[]; totalWeightGram: number}):
  {result:'OK'} | {result:'VALIDATION_ERROR' | 'CART_EMPTY' | 'WEIGHT_LIMIT_EXCEEDED'} | {result:'ITEMS_UNAVAILABLE';productIds:string[]} {
  if (!['inCity','upcountry','remote'].includes(input.zone as string) || !['standard','express'].includes(input.speed as string)) return {result:'VALIDATION_ERROR'};
  if (!input.lines.length) return {result:'CART_EMPTY'};
  const bad = input.lines.filter(l => !l.available || l.quantity > l.availableStock).map(l => l.productId);
  if (bad.length) return {result:'ITEMS_UNAVAILABLE',productIds:bad};
  return {result:input.totalWeightGram > 20000 ? 'WEIGHT_LIMIT_EXCEEDED' : 'OK'};
}
export function validateProductUpdate(input: {price?: unknown; stock?: unknown}): ('price' | 'stock')[] {
  if (input.price === undefined && input.stock === undefined) return ['price','stock'];
  const fields: ('price' | 'stock')[] = [];
  if (input.price !== undefined && (typeof input.price !== 'number' || !Number.isInteger(input.price) || input.price < 1 || input.price > 50000)) fields.push('price');
  if (input.stock !== undefined && (typeof input.stock !== 'number' || !Number.isInteger(input.stock) || input.stock < 0 || input.stock > 9999)) fields.push('stock');
  return fields;
}
