import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { api, ApiError, auth, type Cart, type Message, type User } from './api';
import { Products, CartPage, Checkout, Orders, OrderDetail, AdminCoupons } from './Pages';
export type Context = {user:User;cart:Cart|null;testMode:boolean;revision:number;busy:boolean;message:Message|null;act:<T>(job:()=>Promise<T>,success?:(result:T)=>void)=>Promise<void>;report:(error:unknown)=>void};
export const useShop = () => useOutletContext<Context>();
export const money = (n:number) => `฿${n.toLocaleString('th-TH')}`;
export function Value({id,value,currency=false}:{id:string;value:number;currency?:boolean}) {return <span data-testid={id} data-value={value}>{currency?money(value):value}</span>;}
export function App() {
 const [user,setUser] = useState<User|null>(null); const [cart,setCart] = useState<Cart|null>(null);
 const [ready,setReady] = useState(false); const [message,setMessage] = useState<Message|null>(null);
 const [testMode,setTestMode] = useState(false); const [busy,setBusy] = useState(false); const [revision,setRevision] = useState(0);
 const navigate = useNavigate();
 const report = useCallback((error:unknown) => {
   const e = error instanceof ApiError ? error : new ApiError('NETWORK_ERROR','เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
   const details = Object.keys(e.details).length ? ` (${JSON.stringify(e.details)})` : '';
   setMessage({kind:'error',code:e.code,message:e.message+details});
   if (e.code === 'AUTH_REQUIRED') {auth.clear();setUser(null);setCart(null);}
 },[]);
 const refresh = useCallback(async () => {
   const me = await api<{user:User;cart:Cart|null}>('/auth/me'); setUser(me.user);setCart(me.cart);
 },[]);
 useEffect(() => {
   void api<{testMode:boolean}>('/config').then(x=>setTestMode(x.testMode)).catch(report);
   if (!auth.get()) {setReady(true);return;}
   void refresh().catch(report).finally(()=>setReady(true));
 },[refresh,report]);
 async function act<T>(job:()=>Promise<T>,success?:(result:T)=>void) {
   if (busy) return; setBusy(true);setMessage(null);
   try {
     const result = await job(); await refresh();setRevision(v=>v+1);
     const messages = (result as {messages?:Message[]})?.messages;
     if (messages?.length) setMessage(messages[0]);
     success?.(result);
   } catch (error) {report(error);} finally {setBusy(false);}
 }
 async function login(event:React.FormEvent<HTMLFormElement>) {
   event.preventDefault();setBusy(true);setMessage(null);const data = new FormData(event.currentTarget);
   try {
     const result = await api<{token:string;user:User}>('/auth/login','POST',{username:data.get('username'),password:data.get('password')});
     auth.set(result.token);await refresh();setRevision(v=>v+1);navigate(result.user.role === 'Admin'?'/admin/products':'/products',{replace:true});
   } catch (error) {report(error);} finally {setBusy(false);}
 }
 async function logout() {
   setBusy(true);
   try {await api('/auth/logout','POST');auth.clear();setUser(null);setCart(null);setMessage(null);navigate('/login');}
   catch(error) {report(error);} finally {setBusy(false);}
 }
 if (!ready) return <div className="loading" role="status">กำลังโหลดร้าน…</div>;
 const ctx = {user:user!,cart,testMode,revision,busy,message,act,report};
 return <><header><Link to="/products" className="brand">BEAN<span>COFFEE ESSENTIALS</span></Link>
 {user && <><nav><Link data-testid="nav-products" to="/products">สินค้า</Link>{user.role === 'Customer'?<><Link data-testid="nav-cart" to="/cart">ตะกร้า ({cart?.lines.length??0})</Link><Link data-testid="nav-orders" to="/orders">ออเดอร์</Link></>:<><Link data-testid="nav-admin-products" to="/admin/products">จัดการสินค้า</Link><Link data-testid="nav-admin-coupons" to="/admin/coupons">จัดการคูปอง</Link></>}</nav><div className="account"><span>{user.username} · {user.memberTier??'Admin'}</span><button className="ghost" onClick={()=>void logout()} disabled={busy}>ออกจากระบบ</button></div></>}
 </header><main>
 {message && <div className={`message ${message.kind}`} role="alert" data-testid="app-message" data-kind={message.kind} data-code={message.code}>{message.message}<button className="ghost" aria-label="ปิดข้อความ" onClick={()=>setMessage(null)}>×</button></div>}
 <Routes><Route path="/login" element={user?<Navigate to={user.role==='Admin'?'/admin/products':'/products'} replace/>:<section className="login" data-testid="page-login"><p className="eyebrow">YOUR DAILY COFFEE RITUAL</p><h1>ยินดีต้อนรับกลับ</h1><p>ทุกแก้วที่ดี เริ่มต้นที่นี่</p><form onSubmit={login}><label htmlFor="username">ชื่อผู้ใช้</label><input id="username" name="username" autoComplete="username" data-testid="login-username" required/><label htmlFor="password">รหัสผ่าน</label><input id="password" name="password" type="password" autoComplete="current-password" data-testid="login-password" required/><button data-testid="login-submit" disabled={busy}>เข้าสู่ระบบ</button></form><p className="muted">บัญชีสาธิต: cus_normal · cus_prime · admin01<br/>ใช้รหัสผ่านที่ตั้งใน SEED_PASSWORD</p></section>}/>
 <Route element={user?<Outlet context={ctx}/>:<Navigate to="/login" replace/>}>
 <Route path="/products" element={<CustomerStage><Products/></CustomerStage>}/>
 <Route path="/cart" element={<CustomerOnly><CustomerStage><CartPage/></CustomerStage></CustomerOnly>}/>
 <Route path="/checkout" element={<CustomerOnly><CustomerStage><Checkout/></CustomerStage></CustomerOnly>}/>
 <Route path="/success" element={<CustomerOnly><CustomerStage><Checkout success/></CustomerStage></CustomerOnly>}/>
 <Route path="/orders" element={<CustomerOnly><Orders/></CustomerOnly>}/>
 <Route path="/orders/:id" element={<CustomerOnly><OrderDetail/></CustomerOnly>}/>
 <Route path="/admin/products" element={<AdminOnly><Products/></AdminOnly>}/>
 <Route path="/admin/coupons" element={<AdminOnly><AdminCoupons/></AdminOnly>}/>
 </Route><Route path="*" element={<Navigate to={user?.role==='Admin'?'/admin/products':user?'/products':'/login'} replace/>}/></Routes>
 </main><footer><span>BEAN / Everyday, a better brew.</span><span>Shopping Cart · SRS-CART-002 v1.8</span></footer></>;
}
function CustomerOnly({children}:{children:React.ReactNode}) {return useShop().user.role==='Customer'?children:<Navigate to="/admin/products" replace/>;}
function AdminOnly({children}:{children:React.ReactNode}) {return useShop().user.role==='Admin'?children:<Navigate to="/products" replace/>;}
function CustomerStage({children}:{children:React.ReactNode}) {
 const {user,cart}=useShop();const location=useLocation();
 if(user.role==='Admin') return <Navigate to="/admin/products" replace/>;
 const path = cart?.stage==='checkout'?'/checkout':cart?.stage==='success'?'/success':null;
 if(path && location.pathname!==path) return <Navigate to={path} replace/>;
 if(!path && location.pathname==='/checkout') return <Navigate to="/cart" replace/>;
 if(!path && location.pathname==='/success') return <Navigate to="/products" replace/>;
 return children;
}
