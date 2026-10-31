import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Product, type Coupon, type Order, type Message } from './api';
import { Value, useShop } from './App';
function useData<T>(path:string) {
 const {revision,report}=useShop();const [data,setData]=useState<T|null>(null);
 useEffect(()=>{let active=true;setData(null);void api<T>(path).then(v=>{if(active)setData(v);}).catch(e=>{if(active)report(e);});return()=>{active=false;};},[path,revision,report]);return data;
}
function Heading({tag,title,description}:{tag:string;title:string;description:string}) {return <div className="heading"><p className="eyebrow">{tag}</p><h1>{title}</h1><p>{description}</p></div>;}
export function Products() {
 const data=useData<Product[]>('/products');const admin=useShop().user.role==='Admin';
 return <section data-testid={admin?'page-admin-products':'page-products'}><Heading tag={admin?'STORE ADMINISTRATION':'CURATED FOR YOUR EVERYDAY'} title={admin?'จัดการสินค้า':'เริ่มต้นวันดี ๆ ด้วยกาแฟ'} description={admin?'อัปเดตราคา สต็อก และสถานะการขาย':'เมล็ดกาแฟและอุปกรณ์ที่คัดมา เพื่อแก้วโปรดของคุณ'}/>
 {!data?<p role="status">กำลังโหลดสินค้า…</p>:data.length?<div className="products">{data.map(p=><ProductCard key={p.productId} product={p} admin={admin}/>)}</div>:<p>ยังไม่มีสินค้าพร้อมขาย</p>}</section>;
}
function ProductCard({product:p,admin}:{product:Product;admin:boolean}) {
 const {act,busy}=useShop();const [qty,setQty]=useState('1');const [price,setPrice]=useState(String(p.price));const [stock,setStock]=useState(String(p.stock));
 
 return <article className="product" data-testid={`${admin?'admin-product':'product'}-row-${p.productId}`}>
 <div className={`product-art art-${p.productId}`} aria-hidden="true"><ProductArt id={p.productId}/><small>{p.productId==='P1'?'SINGLE ORIGIN':p.productId==='P2'?'SLOW BREW':'HOME BARISTA'}</small></div>
 <div className="product-body"><p className="eyebrow">{p.productId} / {p.weightGram.toLocaleString()} G</p><h2 data-testid="product-name">{p.name}</h2>
 <div className="product-meta"><strong><Value id={admin?'admin-product-price':'product-price'} value={p.price} currency/></strong><span>คงเหลือ <Value id={admin?'admin-product-stock':'product-stock'} value={p.stock}/> ชิ้น</span></div>
 {admin?<><p data-testid="admin-product-status" data-status={String(p.isOnSale)}>{p.isOnSale?'เปิดขาย':'ปิดขาย'}</p><form onSubmit={e=>{e.preventDefault();void act(()=>api(`/admin/products/${p.productId}`,'PATCH',{price:Number(price),stock:Number(stock)}));}}><div className="form-pair"><div><label htmlFor={`price-${p.productId}`}>ราคา</label><input id={`price-${p.productId}`} data-testid="admin-product-price-input" type="number" value={price} onChange={e=>setPrice(e.target.value)}/></div><div><label htmlFor={`stock-${p.productId}`}>สต็อก</label><input id={`stock-${p.productId}`} data-testid="admin-product-stock-input" type="number" value={stock} onChange={e=>setStock(e.target.value)}/></div></div><button data-testid="admin-product-save" disabled={busy}>บันทึก</button></form><button className="secondary" data-testid="admin-product-toggle-status" disabled={busy} onClick={()=>void act(()=>api(`/admin/products/${p.productId}/status`,'PATCH',{isOnSale:!p.isOnSale}))}>{p.isOnSale?'ปิดการขาย':'เปิดการขาย'}</button></>:<form className="buy" onSubmit={e=>{e.preventDefault();void act(()=>api('/cart/items','POST',{productId:p.productId,quantity:Number(qty)}));}}><div><label htmlFor={`qty-${p.productId}`}>จำนวน</label><input id={`qty-${p.productId}`} data-testid="product-add-qty" type="number" value={qty} onChange={e=>setQty(e.target.value)}/></div><button data-testid="product-add-button" disabled={busy}>เพิ่มลงตะกร้า +</button></form>}
 </div></article>;
}
function ProductArt({id}:{id:string}) {
 return <svg viewBox="0 0 220 160" width="220" height="160" fill="none" aria-hidden="true">
 <ellipse cx="110" cy="143" rx="63" ry="8" fill="currentColor" opacity=".12"/>
 {id==='P1'?<><path d="M71 23h77l8 112H63L71 23Z" fill="#9a7151"/><path d="M71 23h77l-6-10H78l-7 10Z" fill="#805b41"/><path d="M75 27h69" stroke="#63452f" strokeWidth="3"/><rect x="75" y="47" width="67" height="63" rx="2" fill="#f4efe1"/><text x="108" y="68" textAnchor="middle" fontSize="13" letterSpacing="3" fill="#344d39">BEAN</text><ellipse cx="108" cy="85" rx="7" ry="11" transform="rotate(25 108 85)" fill="#42563e"/><path d="m110 76-4 18" stroke="#f4efe1"/><text x="108" y="104" textAnchor="middle" fontSize="5" letterSpacing="1.5" fill="#344d39">SINGLE ORIGIN / 250 G</text></>:
 id==='P2'?<><path d="M148 62c45-13 38 48 7 47" stroke="#3a4038" strokeWidth="11"/><path d="M72 52h62l23 66c4 10-9 17-43 17s-53-7-50-17l8-66Z" fill="#687268"/><path d="M73 62C36 62 49 96 24 93" stroke="#687268" strokeWidth="9" strokeLinecap="round"/><path d="M69 51h68" stroke="#3a4038" strokeWidth="8" strokeLinecap="round"/><path d="M93 43h20" stroke="#956f4c" strokeWidth="9" strokeLinecap="round"/><path d="M76 72 68 115" stroke="#bec6ba" strokeWidth="4" opacity=".5"/></>:
 <><rect x="53" y="31" width="122" height="102" rx="8" fill="#4c5d57"/><rect x="64" y="43" width="100" height="31" rx="3" fill="#b9c8bf"/><circle cx="90" cy="58" r="9" fill="#eff0e7"/><path d="m90 58 3-5" stroke="#52665a" strokeWidth="2"/><circle cx="139" cy="57" r="3" fill="#a7bf80"/><path d="M108 75v15h38" stroke="#2e3b34" strokeWidth="8" strokeLinecap="round"/><path d="M73 133h87" stroke="#a9b6ac" strokeWidth="8"/><path d="M96 100h27l-3 22h-20l-4-22Z" fill="#f3eee1"/><path d="M124 104c13-4 12 12-3 10" stroke="#f3eee1" strokeWidth="4"/><path d="M154 79v29" stroke="#bac4bb" strokeWidth="4" strokeLinecap="round"/></>}
 </svg>;
}
export function CartPage() {
 const {cart,act,busy,message}=useShop();const navigate=useNavigate();const [code,setCode]=useState('');const [zone,setZone]=useState('inCity');const [speed,setSpeed]=useState('standard');
 if(!cart)return null;
 return <section data-testid="page-cart"><Heading tag="YOUR COLLECTION" title="ตะกร้าของคุณ" description="ตรวจสอบรายการ แล้วเลือกวิธีจัดส่งที่สะดวก"/>
 <div className="split"><div className="panel">{!cart.lines.length?<p className="empty-cart" data-testid={message?undefined:"app-message"} data-kind="info" data-code="">ตะกร้าว่าง</p>:cart.lines.map(line=><CartLine key={line.productId} line={line}/>)}<Link to="/products">← เลือกสินค้าเพิ่ม</Link></div>
 <aside className="panel summary"><h2>สรุปรายการ</h2><div className="summary-row"><span>ยอดรวมสินค้า</span><Value id="cart-subtotal" value={cart.subtotal} currency/></div><p>คูปองที่ผูก: <strong data-testid="cart-coupon-code">{cart.couponCode??'—'}</strong></p>
 <form onSubmit={e=>{e.preventDefault();void act(()=>api('/cart/coupon','POST',{code}));}}><label htmlFor="coupon">รหัสคูปอง</label><div className="inline"><input id="coupon" data-testid="coupon-input" value={code} onChange={e=>setCode(e.target.value)} placeholder="SAVE10"/><button className="secondary" data-testid="coupon-apply" disabled={busy}>ใช้คูปอง</button></div></form>
 <label htmlFor="zone">โซนจัดส่ง</label><select id="zone" data-testid="zone-select" value={zone} onChange={e=>setZone(e.target.value)}><option value="inCity">ในเมือง</option><option value="upcountry">ต่างจังหวัด</option><option value="remote">พื้นที่ห่างไกล</option></select>
 <label htmlFor="speed">ความเร็วจัดส่ง</label><select id="speed" data-testid="speed-select" value={speed} onChange={e=>setSpeed(e.target.value)}><option value="standard">มาตรฐาน</option><option value="express">ด่วน</option></select>
 <p className="muted">ส่วนลดและค่าจัดส่งจะคำนวณเมื่อเข้าสู่ขั้นตอนชำระเงิน</p><button data-testid="checkout-button" disabled={!cart.lines.length || cart.stage!=='cart' || busy} onClick={()=>void act(()=>api('/checkout','POST',{zone,speed}),()=>navigate('/checkout'))}>ชำระเงิน →</button></aside></div></section>;
}
function CartLine({line:l}:{line:NonNullable<ReturnType<typeof useShop>['cart']>['lines'][number]}) {
 const {act,busy}=useShop();const [quantity,setQuantity]=useState(String(l.quantity));
 useEffect(()=>setQuantity(String(l.quantity)),[l.quantity]);
 return <article className="cart-line" data-testid={`cart-line-${l.productId}`}><div><h2 data-testid="cart-line-name">{l.name}</h2><Value id="cart-line-unit-price" value={l.price} currency/><p>จำนวน <Value id="cart-line-qty" value={l.quantity}/> ชิ้น · <span data-testid="cart-line-availability" data-available={l.available}>{l.available?'พร้อมขาย':'ไม่พร้อมขาย'}</span></p></div>
 <form className="inline" onSubmit={e=>{e.preventDefault();void act(()=>api(`/cart/items/${l.productId}`,'PATCH',{quantity:Number(quantity)}));}}><div><label htmlFor={`cart-qty-${l.productId}`}>จำนวนใหม่</label><input id={`cart-qty-${l.productId}`} data-testid="cart-line-qty-input" type="number" value={quantity} onChange={e=>setQuantity(e.target.value)}/></div><button className="secondary" data-testid="cart-line-update" disabled={busy}>อัปเดต</button><button className="danger" type="button" data-testid="cart-line-remove" disabled={busy} onClick={()=>void act(()=>api(`/cart/items/${l.productId}`,'DELETE'))}>ลบ</button></form></article>;
}
export function Checkout({success=false}:{success?:boolean}) {
 const {cart,act,busy,testMode}=useShop();const navigate=useNavigate();const order=useData<Order>(`/orders/${cart?.currentOrderId}`);
 const prefix=success?'success':'checkout';
 return <section data-testid={`page-${prefix}`}><Heading tag={success?'THANK YOU':'ONE STEP TO YOUR NEXT BREW'} title={success?'สั่งซื้อสำเร็จแล้ว':'ตรวจสอบและชำระเงิน'} description={success?'ขอบคุณที่ให้เราเป็นส่วนหนึ่งของแก้วโปรด':'สต็อกของรายการนี้ถูกจองไว้จนกว่าจะชำระสำเร็จหรือยกเลิก'}/>
 {!order?<p role="status">กำลังโหลดออเดอร์…</p>:<div className="split"><div className="panel"><p>หมายเลขออเดอร์</p><strong className="order-id" data-testid={`${prefix}-order-id`}>{order.orderId}</strong><OrderLines order={order} prefix={success?'success-line':'checkout-line'}/></div><aside className="panel summary"><Totals order={order} prefix={prefix}/>
 {success?<button data-testid="continue-shopping-button" disabled={busy} onClick={()=>void act(()=>api('/continue-shopping','POST'),()=>navigate('/products'))}>เลือกซื้อสินค้าต่อ</button>:<>{testMode?<div className="gateway"><p className="eyebrow">PAYMENT SIMULATOR / TEST MODE</p><button data-testid="gateway-pay-success" disabled={busy} onClick={()=>void act(()=>api<{order:Order;messages:Message[]}>(`/gateway/orders/${order.orderId}/success`,'POST'),()=>navigate('/success'))}>จำลองชำระสำเร็จ</button><button className="secondary" data-testid="gateway-pay-fail" disabled={busy} onClick={()=>void act(()=>api(`/gateway/orders/${order.orderId}/fail`,'POST'))}>จำลองชำระล้มเหลว</button></div>:<p className="muted">ยังไม่มี gateway จริง เปิด NODE_ENV=test กับฐานข้อมูลทดสอบเพื่อใช้ปุ่มจำลอง</p>}<button className="danger" data-testid="cancel-checkout-button" disabled={busy} onClick={()=>void act(()=>api('/checkout/cancel','POST'),()=>navigate('/cart'))}>ยกเลิกการชำระเงิน</button></>}
 </aside></div>}</section>;
}
function Totals({order:o,prefix}:{order:Order;prefix:string}) {
 return <><h2>ยอดชำระ</h2>{([['subtotal','ยอดรวมสินค้า',o.subtotal],['discount','ส่วนลด',o.discount],['shipping','ค่าจัดส่ง',o.shippingFee],['total','ยอดสุทธิ',o.netTotal]] as const).map(([id,title,value])=><div className={`summary-row ${id==='total'?'total':''}`} key={id}><span>{title}</span><Value id={`${prefix}-${id}`} value={value} currency/></div>)}<p className="muted">คูปอง: {o.couponCode??'—'} · ส่วนลด: {o.discountSource}<br/>จัดส่ง: {o.zone} / {o.speed} · {o.totalWeightGram.toLocaleString()} กรัม</p></>;
}
const statuses = {pending:'รอชำระเงิน',paid:'ชำระเงินแล้ว',cancelled:'ยกเลิก'};
function OrderLines({order,prefix}:{order:Order;prefix:string}) {return <div>{order.lines.map(l=><div className="order-line" key={l.productId} data-testid={`${prefix}-${l.productId}`}><strong>{l.name}</strong><div><Value id="order-line-unit-price" value={l.price} currency/> × <Value id="order-line-qty" value={l.quantity}/></div></div>)}</div>;}
export function Orders() {
 const orders=useData<Order[]>('/orders');return <section data-testid="page-orders"><Heading tag="YOUR COFFEE JOURNEY" title="ออเดอร์ของคุณ" description="รายการล่าสุดอยู่ด้านบนเสมอ"/>
 <div className="panel">{!orders?<p role="status">กำลังโหลดออเดอร์…</p>:!orders.length?<p>ยังไม่มีออเดอร์</p>:orders.map(o=><article className="order-list-row" key={o.orderId} data-testid={`order-row-${o.orderId}`}><div><strong className="order-id">{o.orderId}</strong><p>{new Date(o.createdAt).toLocaleString('th-TH')}</p></div><span className={`badge ${o.status}`} data-testid="order-status" data-status={o.status}>{statuses[o.status]}</span><Value id="order-total" value={o.netTotal} currency/><Link data-testid="order-view" to={`/orders/${o.orderId}`}>ดูรายละเอียด →</Link></article>)}</div></section>;
}
export function OrderDetail() {
 const {id}=useParams();const order=useData<Order>(`/orders/${encodeURIComponent(id!)}`);
 return <section data-testid="page-order-detail"><Heading tag="ORDER DETAILS" title="รายละเอียดออเดอร์" description="ข้อมูลสินค้าและราคาที่บันทึก ณ เวลาสั่งซื้อ"/>{order?<div className="split"><div className="panel"><strong className="order-id" data-testid="order-detail-id">{order.orderId}</strong><p className={`badge ${order.status}`} data-testid="order-detail-status" data-status={order.status}>{statuses[order.status]}</p><OrderLines order={order} prefix="order-line"/></div><aside className="panel summary"><Totals order={order} prefix="order-detail"/></aside></div>:<p role="status">กำลังโหลดรายละเอียด…</p>}<Link to="/orders">← กลับสู่ออเดอร์</Link></section>;
}
export function AdminCoupons() {
 const coupons=useData<Coupon[]>('/admin/coupons');const {act,busy}=useShop();
 return <section data-testid="page-admin-coupons"><Heading tag="STORE ADMINISTRATION" title="จัดการคูปอง" description="สถานะใหม่มีผลกับการ checkout ครั้งถัดไป"/><div className="coupons">{!coupons?<p role="status">กำลังโหลดคูปอง…</p>:coupons.map(c=><article className="panel coupon-card" key={c.code} data-testid={`admin-coupon-row-${c.code}`}><p className="eyebrow">COUPON</p><h2>{c.code}</h2><p>ลด <Value id="admin-coupon-percent" value={c.percent}/>% เมื่อซื้อครบ <Value id="admin-coupon-min-spend" value={c.minSpend} currency/></p><p data-testid="admin-coupon-status" data-status={String(c.active)}>{c.active?'เปิดใช้':'ปิดใช้'}</p><button data-testid="admin-coupon-toggle-status" disabled={busy} onClick={()=>void act(()=>api(`/admin/coupons/${c.code}/status`,'PATCH',{active:!c.active}))}>{c.active?'ปิดใช้คูปอง':'เปิดใช้คูปอง'}</button></article>)}</div></section>;
}
