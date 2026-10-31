export type User = {id:string;username:string;role:'Customer'|'Admin';memberTier:'normal'|'prime'|null};
export type Product = {productId:string;name:string;price:number;weightGram:number;stock:number;isOnSale:boolean};
export type Coupon = {code:string;percent:number;minSpend:number;active:boolean};
export type Line = Product & {quantity:number;available:boolean};
export type Cart = {userId:string;stage:'cart'|'checkout'|'success';couponCode:string|null;currentOrderId:string|null;lines:Line[];subtotal:number};
export type Order = {orderId:string;userId:string;status:'pending'|'paid'|'cancelled';createdAt:string;lines:{productId:string;name:string;price:number;weightGram:number;quantity:number}[];subtotal:number;discount:number;discountSource:'coupon'|'member'|'none';shippingFee:number;netTotal:number;totalWeightGram:number;zone:string;speed:string;couponCode:string|null};
export type Message = {kind:'info'|'notice'|'error';code:string;message:string};
export class ApiError extends Error {
 constructor(public code:string,message:string,public details:Record<string,unknown>={}) {super(message);}
}
const origin = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/,'');
export const auth = {
 get:() => sessionStorage.getItem('bean.token'),
 set:(token:string) => sessionStorage.setItem('bean.token',token),
 clear:() => sessionStorage.removeItem('bean.token')
};
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T> {
 const token = auth.get();
 const response = await fetch(`${origin}/api${path}`,{method,
   headers:{...(body === undefined ? {} : {'Content-Type':'application/json'}),...(token ? {Authorization:`Bearer ${token}`} : {})},
   ...(body === undefined ? {} : {body:JSON.stringify(body)})});
 const payload = await response.json();
 if (!response.ok) throw new ApiError(payload.error?.code ?? 'HTTP_ERROR',payload.error?.message ?? 'Request failed',payload.error?.details);
 return payload.data as T;
}
