# BEAN — Shopping Cart + Supabase

**Combined project:** เริ่มติดตั้งจาก Clone/ZIP และรันทดสอบทุกระดับตาม [TESTING-README.md](TESTING-README.md)
ใช้ `.env.e2e` ชุดเดียวผ่านคำสั่ง root ที่ตรวจ target ก่อนรัน DB ไม่คัดลอก credential จาก `backend/.env.example` หรือ Git history
รายละเอียดด้านล่างเป็นคู่มือแอปเดิม; สำหรับ test setup ให้ใช้คู่มือ Combined ข้างต้น

โค้ดเขียนใหม่จาก SRS-CART-002 v1.8 โดยใช้ ZIP เดิมเป็นข้อมูลอ้างอิงของขอบเขตงาน ไม่ได้เปลี่ยนชื่อไฟล์แล้วส่งโค้ดเดิม
Frontend เป็น React SPA + Vite (แทน Next.js ใน ZIP) และ backend แยก HTTP, domain rules, service และ persistence ชัดเจน มี SQL schema ใหม่ชื่อ `bean` ซึ่งไม่ทับ schema `cart_api` ของ ZIP เดิม

ระบบนี้เป็น term project และใช้ Supabase PostgreSQL เป็นแหล่งข้อมูลหลัก ไม่ใช้ in-memory storage แทนฐานข้อมูล

เวอร์ชันนี้นำแนวคิดจาก `cartory-frontend-backend-demo` มาปรับเข้ากับ Supabase จริงแล้ว: เพิ่ม unit tests ของ pure rules และ integration test สำหรับ HTTP ที่ใช้ฐานข้อมูล Supabase เมื่อกำหนด `RUN_DB_TESTS=true` พร้อม API contract และ test IDs สำหรับเขียน Playwright E2E ต่อ

## เครื่องมือ

- ฟอนต์ไทย Noto Sans Thai ติดตั้งเป็น dependency และเสิร์ฟพร้อมเว็บ ไม่ต้องโหลด Google Fonts ขณะใช้งาน
- Node.js 22.12 ขึ้นไป (แนะนำ Node 24 LTS), npm
- Supabase Cloud project สำหรับ PostgreSQL
- ไม่ต้องติดตั้ง Docker, Supabase CLI หรือ PostgreSQL บนเครื่อง
- รหัสผ่านฐานข้อมูลอยู่ใน backend เท่านั้น ไม่มี Supabase secret/service key ใน browser
- ใช้บัญชีและ session ของแอปเองตาม username ใน SRS ไม่ใช้ Supabase Auth เพราะ SRS ไม่ต้องการสมัครสมาชิก

## เริ่มรันบน Windows (PowerShell)

1. แตก ZIP แล้วเปิด terminal ที่โฟลเดอร์ `cart-supabase` ซึ่งมี `package.json` หลัก
2. สร้างโปรเจกต์บน https://supabase.com/dashboard และรอให้พร้อม
3. เลือก **Connect → Session pooler** คัดลอก PostgreSQL URI ของโปรเจกต์ (ปกติ port 5432) ใช้ connection string จริงจาก dashboard ไม่เดาชื่อ host
4. ติดตั้งและคัดลอก environment:

```powershell
npm ci
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

แก้ `backend/.env`:

```dotenv
DATABASE_URL=postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@YOUR_SESSION_POOLER_HOST:5432/postgres
DATABASE_SSL=true
DATABASE_CA_FILE=
PORT=4000
WEB_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
NODE_ENV=test
ALLOW_TEST_RESET=true
TEST_RESET_KEY=change-this-to-a-random-secret-at-least-24-characters
SEED_PASSWORD=REPLACE_WITH_LOCAL_SEED_PASSWORD
```

ใช้ **database password** ของโปรเจกต์ ไม่ใช่ anon key หรือรหัสผ่านบัญชี Supabase
หาก password มี `@`, `#`, `%`, `:` ฯลฯ ต้อง percent-encode ส่วน password ใน URI
อย่าใส่ `sslmode`, `sslrootcert`, `sslcert`, `sslkey` ใน URL เพราะโปรแกรมกำหนด SSL เอง
หากเครื่องไม่เชื่อถือ certificate ให้ดาวน์โหลด CA ของฐานข้อมูลจาก Supabase แล้วตั้ง `DATABASE_CA_FILE=C:/path/to/prod-ca.crt` โดยคง `DATABASE_SSL=true`

`NODE_ENV=test` เปิด gateway จำลองบนหน้า checkout และ endpoints สำหรับ OP-10/11 เพื่อให้ลอง flow ครบได้ ตั้งแบบนี้เฉพาะโปรเจกต์ฐานข้อมูลสำหรับเรียน/ทดสอบเท่านั้น
`ALLOW_TEST_RESET=true` และ secret ความยาวอย่างน้อย 24 ตัว เปิด reset endpoint; หากไม่ต้องการ reset ให้ตั้ง false แม้อยู่ test mode

5. สร้างตารางและข้อมูลตั้งต้น:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

รัน unit tests ของกฎธุรกิจได้โดยไม่ต้องมี Supabase:

```powershell
npm run test:domain
```

รัน HTTP integration test กับ Supabase test database หลัง migrate/seed และตั้ง `RUN_DB_TESTS=true`:

```powershell
$env:RUN_DB_TESTS="true"
npm run test:http
```

ถ้าใช้ Command Prompt:

```cmd
set RUN_DB_TESTS=true
npm run test:http
```

HTTP test ถูก skip โดยตั้งใจเมื่อไม่มี `DATABASE_URL` หรือไม่ได้เปิด `RUN_DB_TESTS=true` เพื่อป้องกันยิงฐานข้อมูลจริงโดยไม่ตั้งใจ

- เว็บ: http://localhost:5173/login
- API: http://localhost:4000/api
- สถานะ DB: http://localhost:4000/api/health
- บัญชี `cus_normal`, `cus_prime`, `admin01` ใช้รหัสผ่านเดียวกับ `SEED_PASSWORD`
- ตัวอย่างนี้คือ `REPLACE_WITH_LOCAL_SEED_PASSWORD`; SRS ไม่กำหนด password จึงกำหนดผ่าน env

สำหรับ macOS/Linux ใช้ `cp backend/.env.example backend/.env` และ `cp frontend/.env.example frontend/.env` แทน `Copy-Item`

`db:seed` เพิ่มเฉพาะแถวที่ยังไม่มี ไม่ล้างออเดอร์และไม่เปลี่ยนรหัสผ่านบัญชีเดิม การเปลี่ยน SEED_PASSWORD มีผลกับบัญชีที่ seed ใหม่หรือ reset ใหม่เท่านั้น

## Flow ที่ควรลอง

1. เข้าบัญชี `cus_prime` → เพิ่ม P1 จำนวน 1 และ P2 จำนวน 1
2. ตะกร้า → ผูก SAVE10 → ในเมือง / มาตรฐาน → ชำระเงิน
3. ต้องเห็น subtotal 1,650, discount 165, shipping 0, total 1,485 ตาม AC-4
4. จำลองล้มเหลว: ค้างหน้า checkout และ stock ยังถูกจอง
5. จำลองสำเร็จ: หน้า success, ตะกร้าว่าง, stock ไม่ถูกหักซ้ำ
6. เลือกซื้อสินค้าต่อ หรือเปิดออเดอร์เพื่อดู snapshot
7. เปิดอีก browser หรือ incognito เป็น admin เพื่อแก้ราคา/stock/สถานะ แล้วตรวจพฤติกรรมข้ามผู้ใช้

## โครงสร้าง

| ตำแหน่ง | หน้าที่ |
|---|---|
| `backend/src/domain/pricing.ts` | pure functions ตาม signature DC-1 ทั้ง 10 ฟังก์ชัน |
| `backend/src/domain/shop.ts` | business operations, stage, order snapshot, stock reservation |
| `backend/src/domain/errors.ts` | domain errors และ HTTP status mapping |
| `backend/src/app.ts` | REST routes, auth/role, test-only gateway/reset; export createApp โดยไม่เปิด port |
| `backend/src/db/repository.ts` | SQL transaction, โหลด state และเขียนเฉพาะข้อมูลที่เปลี่ยน |
| `backend/src/db/seed.ts` | seed ตาม SRS ส่วนที่ 7 เท่านั้น |
| `database/001_schema.sql` | relational schema, constraints, RLS, immutable order snapshot trigger |
| `frontend/src/api.ts` | HTTP client และ bearer token ใน sessionStorage |
| `frontend/src/App.tsx` | login, navigation, auth และ stage guards |
| `frontend/src/Pages.tsx` | หน้า customer/admin พร้อม locator ตาม SRS |
| `docs/API.md` | request/response, errors และคำแนะนำ Playwright |
| `docs/openapi.json` | OpenAPI 3.0.3 contract สำหรับเครื่องมือ API |
| `docs/SRS-MAPPING.md` | mapping ข้อกำหนดและการตัดสินใจออกแบบ |

## Database

| ตารางใน schema `bean` | ข้อมูล |
|---|---|
| `accounts` | username, scrypt password hash, role, memberTier |
| `sessions` | SHA-256 ของ bearer token, เจ้าของ, อายุ 24 ชั่วโมง |
| `products` | ราคา น้ำหนัก สต็อกพร้อมขาย สถานะขาย |
| `coupons` | code แบบ case-sensitive, เปอร์เซ็นต์, ยอดขั้นต่ำ, สถานะ |
| `customer_carts` | ตะกร้าคนละใบ, stage, coupon, current order |
| `cart_items` | product และ quantity ต่อ customer (composite primary key) |
| `orders` | เจ้าของ สถานะ เวลา และ immutable JSON snapshot ของรายการ/ราคา/ส่วนลด/ค่าจัดส่ง |

Frontend → Express REST API → `pg` → Supabase PostgreSQL ผ่าน TLS
Browser ไม่อ่านหรือแก้ตาราง Supabase โดยตรง จึงไม่ต้องเปิด schema `bean` เป็น Exposed schema
ตารางเปิด RLS โดยไม่มี policy ให้ anon/authenticated และ revoke สิทธิ์ทั้งสอง role
ในชุดเรียนนี้ backend ต่อด้วย database owner ตาม URI จาก Supabase; auth และการจำกัดเจ้าของทำใน backend

ทุก domain operation ใช้ transaction เดียวพร้อม advisory lock เพื่อทำงานตามลำดับตาม SRS และ rollback เมื่อเกิด error
Repository โหลด state ทั้งร้านใน transaction แล้วอัปเดตเฉพาะรายการที่เปลี่ยน เหมาะกับขนาด term project; ร้านขนาดใหญ่ควรเปลี่ยนเป็น query ราย aggregate โดยคง domain/API contract

## Build และแยก deploy

```powershell
npm run typecheck
npm run build
npm run start -w backend
```

Frontend build อยู่ `frontend/dist` ให้นำไป static hosting และตั้ง SPA fallback ทุก route ไป `index.html` (มี `frontend/vercel.json` ให้ Vercel แล้ว)
ตั้ง `VITE_API_ORIGIN=https://your-api.example.com` **ก่อน build** เมื่อ deploy frontend/backend คนละ origin
ตั้ง backend `WEB_ORIGIN` ให้ตรงกับโดเมน frontend คั่นด้วย comma หากมีหลาย origin
backend นี้เป็น Node server ต้องมี Node hosting ไม่สามารถนำไปใส่ static hosting อย่างเดียวได้
ใช้ HTTPS เมื่อนำขึ้นอินเทอร์เน็ต

นอก test mode (`NODE_ENV=production` หรือ `development`) gateway จำลองและ reset routes จะไม่มีอยู่ (404)
ระบบไม่ได้เชื่อม payment gateway จริง เพราะอยู่นอกขอบเขต SRS; ต้องพัฒนา gateway adapter และ verification ก่อนใช้รับเงินจริง

## Docker จำเป็นหรือไม่

**ไม่จำเป็นสำหรับชุดนี้** เพราะใช้ Supabase Cloud และรัน Node/Vite ในเครื่องโดยตรง
ถ้าจะรัน Supabase stack แบบ local ด้วย `supabase start` จึงต้องมี container runtime ที่รองรับ Docker API ตามแนวทางมาตรฐาน ไม่ได้จำเป็นสำหรับ Supabase Cloud หรือ Playwright API tests

เอกสารอ้างอิง: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase local development](https://supabase.com/docs/guides/local-development), [node-postgres SSL](https://node-postgres.com/features/ssl), [Playwright API testing](https://playwright.dev/docs/api-testing)

## สถานะการตรวจ

ดู `docs/VALIDATION.md` เพื่อแยกสิ่งที่ตรวจแล้วออกจากการเชื่อม Supabase จริงซึ่งต้องใส่ connection string ของผู้ใช้ก่อน
