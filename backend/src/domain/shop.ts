import type { State, User, Cart, Order, Zone, Speed, Message } from './types.js';
import { ensure } from './errors.js';
import * as rules from './pricing.js';
// Transaction service: repository supplies state; ID and time are injected by HTTP layer.
export class Shop {
  constructor(private state: State, private user: User) {}
  private customer(): Cart {
    ensure(this.user.role === 'Customer','AUTH_FORBIDDEN');
    const cart = this.state.carts.find(c => c.userId === this.user.id);
    if (!cart) throw new Error('Missing seeded cart');
    return cart;
  }
  private at(stage: Cart['stage']): Cart {
    const cart = this.customer(); ensure(cart.stage === stage,'OPERATION_NOT_ALLOWED'); return cart;
  }
  private admin() { ensure(this.user.role === 'Admin','AUTH_FORBIDDEN'); }
  products() { return this.state.products.filter(p => this.user.role === 'Admin' || rules.isProductAvailable(p.isOnSale,p.stock)); }
  cart() {
    const cart = this.customer();
    const lines = cart.lines.map(line => {
      const p = this.state.products.find(p => p.productId === line.productId)!;
      return {...p, quantity:line.quantity, available:rules.isProductAvailable(p.isOnSale,p.stock)};
    });
    return {...cart, lines, subtotal:rules.calculateSubtotal(lines)};
  }
  quantity(operation: 'add' | 'update', productId: string, quantity: unknown) {
    const cart = this.at('cart');
    const product = this.state.products.find(p => p.productId === productId);
    const line = cart.lines.find(l => l.productId === productId);
    const result = rules.validateQuantityChange({operation,quantity,productExists:!!product,inCart:!!line,
      available:!!product && rules.isProductAvailable(product.isOnSale,product.stock),
      currentQtyInCart:line?.quantity ?? 0,availableStock:product?.stock ?? 0});
    ensure(result === 'OK',result);
    const next = (quantity as number) + (operation === 'add' ? line?.quantity ?? 0 : 0);
    if (line) line.quantity = next; else cart.lines.push({productId,quantity:next});
    return this.cart();
  }
  remove(productId: string) {
    const cart = this.at('cart');
    ensure(cart.lines.length,'CART_EMPTY',{},'ไม่มีสินค้าให้ลบ');
    ensure(cart.lines.some(l => l.productId === productId),'ITEM_NOT_IN_CART');
    cart.lines = cart.lines.filter(l => l.productId !== productId);
    return {cart:this.cart(), messages:cart.lines.length ? [] : [{kind:'info',code:'',message:'ตะกร้าว่าง'}]};
  }
  coupon(code: string) {
    const cart = this.at('cart');
    ensure(this.state.coupons.some(c => c.code === code && c.active),'COUPON_INVALID');
    cart.couponCode = code; return this.cart();
  }
  checkout(zone: unknown, speed: unknown, orderId: string, createdAt: string) {
    const cart = this.at('cart');
    const lines = this.cart().lines;
    const totalWeightGram = rules.calculateTotalWeight(lines);
    const result = rules.validateCheckout({zone,speed,totalWeightGram,lines:lines.map(l => ({...l,availableStock:l.stock}))});
    ensure(result.result === 'OK',result.result,'productIds' in result ? {productIds:result.productIds} : {});
    const subtotal = rules.calculateSubtotal(lines);
    const coupon = this.state.coupons.find(c => c.code === cart.couponCode) ?? null;
    const discount = rules.calculateDiscount(subtotal,this.user.memberTier!,coupon);
    const messages: Message[] = [];
    if (discount.couponRemoved) {
      cart.couponCode = null;
      messages.push({kind:'notice',code:'COUPON_NOT_APPLICABLE',message:'คูปองไม่สามารถใช้กับคำสั่งซื้อนี้'});
    }
    const weightTier = rules.classifyWeight(totalWeightGram);
    if (weightTier === 'overLimit') throw new Error('Checkout invariant failed');
    const shippingFee = rules.calculateShippingFee(weightTier,zone as Zone,speed as Speed,this.user.memberTier!);
    const order: Order = {orderId,userId:this.user.id,status:'pending',createdAt,
      lines:lines.map(({productId,name,price,weightGram,quantity}) => ({productId,name,price,weightGram,quantity})),
      subtotal,discount:discount.discount,discountSource:discount.source,shippingFee,
      netTotal:rules.calculateNetTotal(subtotal,discount.discount,shippingFee),totalWeightGram,
      zone:zone as Zone,speed:speed as Speed,couponCode:cart.couponCode};
    for (const line of lines) this.state.products.find(p => p.productId === line.productId)!.stock -= line.quantity;
    this.state.orders.push(order); cart.stage = 'checkout'; cart.currentOrderId = orderId;
    return {order,messages};
  }
  cancel() {
    const cart = this.at('checkout');
    const order = this.state.orders.find(o => o.orderId === cart.currentOrderId)!;
    ensure(order?.status === 'pending','OPERATION_NOT_ALLOWED');
    order.status = 'cancelled';
    for (const line of order.lines) this.state.products.find(p => p.productId === line.productId)!.stock += line.quantity;
    cart.stage = 'cart'; cart.currentOrderId = null; return this.cart();
  }
  continueShopping() {
    const cart = this.at('success'); cart.stage = 'cart'; cart.currentOrderId = null; return this.cart();
  }
  orders() { this.customer(); return this.state.orders.filter(o => o.userId === this.user.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.orderId.localeCompare(a.orderId)); }
  order(id: string) {
    this.customer(); const order = this.state.orders.find(o => o.orderId === id && o.userId === this.user.id);
    ensure(order,'ORDER_NOT_FOUND'); return order;
  }
  updateProduct(id: string, input: {price?: unknown; stock?: unknown}) {
    this.admin(); const product = this.state.products.find(p => p.productId === id);
    ensure(product,'PRODUCT_NOT_FOUND');
    const fields = rules.validateProductUpdate(input); ensure(!fields.length,'VALIDATION_ERROR',{fields});
    if (input.price !== undefined) product.price = input.price as number;
    if (input.stock !== undefined) product.stock = input.stock as number;
    return product;
  }
  productStatus(id: string, status: unknown) {
    this.admin(); const product = this.state.products.find(p => p.productId === id);
    ensure(product,'PRODUCT_NOT_FOUND'); ensure(typeof status === 'boolean','VALIDATION_ERROR',{fields:['isOnSale']});
    product.isOnSale = status; return product;
  }
  coupons() { this.admin(); return this.state.coupons; }
  couponStatus(code: string, status: unknown) {
    this.admin(); const coupon = this.state.coupons.find(c => c.code === code);
    ensure(coupon,'COUPON_NOT_FOUND'); ensure(typeof status === 'boolean','VALIDATION_ERROR',{fields:['active']});
    coupon.active = status; return coupon;
  }
}
// Gateway is independent of customer authentication, as required by OP-10/11.
export function payment(state: State, id: string, success: boolean) {
  const order = state.orders.find(o => o.orderId === id); ensure(order,'ORDER_NOT_FOUND');
  const cart = state.carts.find(c => c.userId === order.userId)!;
  ensure(order.status === 'pending' && cart.stage === 'checkout' && cart.currentOrderId === id,'OPERATION_NOT_ALLOWED');
  if (!success) return {order,messages:[{kind:'info',code:'',message:'การชำระเงินล้มเหลว กรุณาลองใหม่'}]};
  order.status = 'paid'; cart.lines = []; cart.couponCode = null; cart.stage = 'success';
  return {order,messages:[]};
}
