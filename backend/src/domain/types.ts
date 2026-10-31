export type Zone = 'inCity' | 'upcountry' | 'remote';
export type Speed = 'standard' | 'express';
export type MemberTier = 'normal' | 'prime';
export type WeightTier = 'light' | 'medium' | 'heavy' | 'overLimit';
export type Role = 'Customer' | 'Admin';
export type Stage = 'cart' | 'checkout' | 'success';
export interface User { id: string; username: string; role: Role; memberTier: MemberTier | null }
export interface Product { productId: string; name: string; price: number; weightGram: number; stock: number; isOnSale: boolean }
export interface Coupon { code: string; percent: number; minSpend: number; active: boolean }
export interface Cart { userId: string; stage: Stage; couponCode: string | null; currentOrderId: string | null; lines: {productId: string; quantity: number}[] }
export interface Order { orderId: string; userId: string; status: 'pending' | 'paid' | 'cancelled'; createdAt: string; lines: {productId: string; name: string; price: number; weightGram: number; quantity: number}[]; subtotal: number; discount: number; discountSource: 'coupon' | 'member' | 'none'; shippingFee: number; netTotal: number; totalWeightGram: number; zone: Zone; speed: Speed; couponCode: string | null }
export interface State { products: Product[]; coupons: Coupon[]; carts: Cart[]; orders: Order[] }
export interface Message { kind: 'error' | 'notice' | 'info'; code: string; message: string }
