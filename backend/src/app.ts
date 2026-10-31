import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from './db/pool.js';
import { transaction, withState, publicUser } from './db/repository.js';
import { passwordMatches, tokenHash } from './db/security.js';
import { seed } from './db/seed.js';
import { Shop, payment } from './domain/shop.js';
import { DomainError, ensure } from './domain/errors.js';
import type { User } from './domain/types.js';
export function createApp() {
 const app = express(); app.disable('x-powered-by');
 // The simulated gateway is available during local development and tests.
 // It remains disabled in production, where a real payment integration is required.
 const testMode = process.env.NODE_ENV !== 'production';
 const origins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',');
 app.use(cors({origin:origins}));
 app.use(express.json({limit:'32kb'}));
 app.use((_req,res,next) => {res.set('Cache-Control','no-store'); next();});
 app.get('/api/health',async (_req,res) => {
   try { await pool.query('SELECT 1'); res.json({data:{status:'ok'}}); }
   catch { res.status(503).json({error:{code:'DATABASE_UNAVAILABLE',message:'Database connection failed',details:{}}}); }
 });
 app.get('/api/config',(_req,res) => res.json({data:{testMode}}));
 app.post('/api/auth/login',async (req,res) => {
   const data = await transaction(async db => {
     const {username,password} = req.body ?? {};
     ensure(typeof username === 'string' && typeof password === 'string','AUTH_INVALID_CREDENTIALS');
     const account = (await db.query('SELECT * FROM bean.accounts WHERE username=$1',[username])).rows[0];
     ensure(account && passwordMatches(password,account.password_hash),'AUTH_INVALID_CREDENTIALS');
     const token = randomBytes(32).toString('hex');
     await db.query("INSERT INTO bean.sessions VALUES($1,$2,now()+interval '24 hours')",[tokenHash(token),account.id]);
     return {token,user:publicUser(account)};
   }); res.json({data});
 });
 async function authenticate(db: PoolClient, req: Request): Promise<User> {
   const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? ''); ensure(match,'AUTH_REQUIRED');
   const account = (await db.query('SELECT a.* FROM bean.accounts a JOIN bean.sessions s ON s.user_id=a.id WHERE s.token_hash=$1 AND s.expires_at>now()',[tokenHash(match[1])])).rows[0];
   ensure(account,'AUTH_REQUIRED'); return publicUser(account);
 }
 app.get('/api/auth/me',async (req,res) => {
   const data = await transaction(async db => {const user = await authenticate(db,req);return withState(db,state => ({user,cart:user.role === 'Customer' ? new Shop(state,user).cart() : null}));});
   res.json({data});
 });
 app.post('/api/auth/logout',async (req,res) => {
   await transaction(async db => {await authenticate(db,req);await db.query('DELETE FROM bean.sessions WHERE token_hash=$1',[tokenHash(req.headers.authorization!.slice(7))]);});
   res.json({data:{loggedOut:true}});
 });
 type Action = (shop: Shop,req: Request) => unknown;
 function route(method: 'get'|'post'|'patch'|'delete',path: string,action: Action,status=200) {
   app[method](path,async (req: Request,res: Response) => {
     const data = await transaction(async db => {
       const user = await authenticate(db,req);
       return withState(db,state => action(new Shop(state,user),req));
     }); res.status(status).json({data});
   });
 }
 const param = (req: Request,key: string) => String(req.params[key]);
 route('get','/api/products',shop => shop.products());
 route('get','/api/cart',shop => shop.cart());
 route('post','/api/cart/items',(shop,req) => shop.quantity('add',req.body?.productId,req.body?.quantity));
 route('patch','/api/cart/items/:id',(shop,req) => shop.quantity('update',param(req,'id'),req.body?.quantity));
 route('delete','/api/cart/items/:id',(shop,req) => shop.remove(param(req,'id')));
 route('post','/api/cart/coupon',(shop,req) => shop.coupon(req.body?.code));
 route('post','/api/checkout',(shop,req) => shop.checkout(req.body?.zone,req.body?.speed,randomUUID(),new Date().toISOString()),201);
 route('post','/api/checkout/cancel',shop => shop.cancel());
 route('post','/api/continue-shopping',shop => shop.continueShopping());
 route('get','/api/orders',shop => shop.orders());
 route('get','/api/orders/:id',(shop,req) => shop.order(param(req,'id')));
 route('patch','/api/admin/products/:id',(shop,req) => shop.updateProduct(param(req,'id'),req.body ?? {}));
 route('patch','/api/admin/products/:id/status',(shop,req) => shop.productStatus(param(req,'id'),req.body?.isOnSale));
 route('get','/api/admin/coupons',shop => shop.coupons());
 route('patch','/api/admin/coupons/:code/status',(shop,req) => shop.couponStatus(param(req,'code'),req.body?.active));
 if (testMode) {
   for (const outcome of ['success','fail']) app.post(`/api/gateway/orders/:id/${outcome}`,async (req,res) => {
     const data = await transaction(db => withState(db,state => payment(state,param(req,'id'),outcome === 'success')));
     res.json({data});
   });
   if (process.env.ALLOW_TEST_RESET === 'true' && (process.env.TEST_RESET_KEY?.length ?? 0) >= 24)
     app.post('/api/testing/reset',async (req,res) => {
       const expected = Buffer.from(process.env.TEST_RESET_KEY!); const actual = Buffer.from(req.get('X-Test-Reset-Key') ?? '');
       ensure(expected.length === actual.length && timingSafeEqual(expected,actual),'AUTH_FORBIDDEN');
       await transaction(db => seed(db,true)); res.json({data:{reset:true}});
     });
 }
 app.use((_req,res) => res.status(404).json({error:{code:'ROUTE_NOT_FOUND',message:'Route not found',details:{}}}));
 app.use((err: unknown,_req: Request,res: Response,_next: NextFunction) => {
   if (err instanceof DomainError) return void res.status(err.status).json({error:{code:err.code,message:err.message,details:err.details}});
   if (err instanceof SyntaxError && 'body' in err) return void res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Malformed JSON',details:{}}});
   if (typeof err === 'object' && err && 'type' in err && err.type === 'entity.too.large') return void res.status(413).json({error:{code:'VALIDATION_ERROR',message:'Request too large',details:{}}});
   // Avoid returning DB internals or connection strings to callers.
   console.error('Request failed:',err instanceof Error ? err.name : 'UnknownError');
   res.status(500).json({error:{code:'INTERNAL_ERROR',message:'เกิดข้อผิดพลาดภายในระบบ',details:{}}});
 });
 return app;
}
