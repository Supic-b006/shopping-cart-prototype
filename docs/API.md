# REST API contract v1

Base URL: `http://localhost:4000/api`. UTF-8 JSON, ราคาทั้งหมดเป็นจำนวนเต็มหน่วยบาท, น้ำหนักเป็นกรัม

## Authentication และ envelope

Login ไม่ต้องมี token:

```http
POST /api/auth/login
Content-Type: application/json

{"username":"cus_prime","password":"REPLACE_WITH_LOCAL_SEED_PASSWORD"}
```

```json
{"data":{"token":"<64-character-bearer-token>","user":{"id":"cus_prime","username":"cus_prime","role":"Customer","memberTier":"prime"}}}
```

ทุก endpoint ในตาราง OP-2–OP-9 และ OP-12–OP-18 ต้องส่ง `Authorization: Bearer <token>`
Login ไม่เปลี่ยนตะกร้า stage หรือการจอง stock. Logout ลบเฉพาะ session ที่ส่งมา
`GET /auth/me` คืน `{data:{user,cart}}`; cart เป็น null สำหรับ Admin
`POST /auth/logout` คืน `{data:{loggedOut:true}}`

ทุก success ห่อด้วย `data`. ทุก error รูปแบบเดียวกัน:

```json
{"error":{"code":"VALIDATION_ERROR","message":"ข้อมูลไม่ถูกต้อง","details":{"fields":["price","stock"]}}}
```

Validation ไม่แปลง string เป็นตัวเลข: `{"quantity":"2"}` เป็น VALIDATION_ERROR
JSON body ที่เกี่ยวกับแต่ละ operation ดูตารางด้านล่าง; path params ต้องใช้ URL encoding

## Operations

ทุกแถว success 200 ยกเว้น checkout = 201. Customer/Admin role บังคับโดย backend

| OP | Method + path (ต่อจาก /api) | JSON body | `data` ที่คืน |
|---|---|---|---|
| 1 | POST /auth/login | username, password | token, user |
| 2 | GET /products | — | Product[]; customer เห็นเฉพาะพร้อมขาย, admin เห็นทั้งหมด |
| 3 | POST /cart/items | productId, quantity | Cart |
| 4 | PATCH /cart/items/{productId} | quantity | Cart |
| 5 | DELETE /cart/items/{productId} | — | {cart: Cart, messages: Message[]} |
| 6 | POST /cart/coupon | code | Cart |
| 7 | GET /cart | — | Cart |
| 8 | POST /checkout | zone, speed | {order: Order, messages: Message[]} |
| 9 | POST /checkout/cancel | — | Cart |
| 10 | POST /gateway/orders/{orderId}/success | — | {order: Order, messages: []} |
| 11 | POST /gateway/orders/{orderId}/fail | — | {order: Order, messages: Message[]} |
| 12 | POST /continue-shopping | — | Cart |
| 13 | GET /orders | — | Order[] ของผู้เรียก ใหม่ไปเก่า |
| 14 | GET /orders/{orderId} | — | Order ของผู้เรียก |
| 15 | PATCH /admin/products/{productId} | price และ/หรือ stock | Product |
| 16 | PATCH /admin/products/{productId}/status | isOnSale: boolean | Product |
| 17 | PATCH /admin/coupons/{code}/status | active: boolean | Coupon |
| 18 | GET /admin/coupons | — | Coupon[] |

OP-10/11 มีอยู่เฉพาะ `NODE_ENV=test` ไม่ต้องมี Customer token ตามขอบเขต gateway จำลองของ SRS; นอก test mode คืน 404 ไม่ใช้เป็น webhook production
`GET /config` ไม่ต้อง auth คืน `{testMode:boolean}`. `GET /health` ตรวจเชื่อม DB: 200 หรือ 503

## Models และ enum

- User: `id`, `username`, `role: Customer|Admin`, `memberTier: normal|prime|null` (Admin=null)
- Product: `productId`, `name`, `price`, `weightGram`, `stock`, `isOnSale:boolean`
- Coupon: `code`, `percent`, `minSpend`, `active:boolean`
- Cart: `userId`, `stage: cart|checkout|success`, `couponCode:string|null`, `currentOrderId:string|null`, `lines`, `subtotal`
- Cart line: ทุก field ของ Product + `quantity`, `available:boolean`
- Order: `orderId:UUID`, `userId`, `status: pending|paid|cancelled`, `createdAt:ISO8601`, `lines`, `subtotal`, `discount`, `discountSource: coupon|member|none`, `shippingFee`, `netTotal`, `totalWeightGram`, `zone`, `speed`, `couponCode:string|null`
- Order line snapshot: `productId`, `name`, `price`, `weightGram`, `quantity`
- Zone: `inCity|upcountry|remote`; Speed: `standard|express`
- Message: `kind:info|notice|error`, `code:string` (info ใช้ `""`), `message:string`

UI `data-status` ของ order ใช้ enum `pending|paid|cancelled` ตรง API
สถานะ product ใน API เป็น boolean `isOnSale`; UI `data-status` ใช้สตริง `true|false`
สถานะ coupon ใน API เป็น boolean `active`; UI `data-status` ใช้สตริง `true|false`
ข้อมูลตัวเลขที่แสดงมี `data-value` ไม่ใส่ comma/สัญลักษณ์ ฿
Cart subtotal ใช้ราคาปัจจุบันเสมอ; การดู cart ไม่ถอด coupon หรือประเมิน discount จน checkout

## Error status mapping

| HTTP | domain code |
|---|---|
| 400 | VALIDATION_ERROR, QTY_OUT_OF_RANGE |
| 401 | AUTH_REQUIRED, AUTH_INVALID_CREDENTIALS |
| 403 | AUTH_FORBIDDEN |
| 404 | PRODUCT_NOT_FOUND, ORDER_NOT_FOUND, COUPON_NOT_FOUND |
| 409 | PRODUCT_UNAVAILABLE, INSUFFICIENT_STOCK, ITEM_NOT_IN_CART, CART_EMPTY, COUPON_INVALID, ITEMS_UNAVAILABLE, WEIGHT_LIMIT_EXCEEDED, OPERATION_NOT_ALLOWED |

`VALIDATION_ERROR` ของ admin product update มี `details.fields` ครบทุก field ที่ไม่ผ่าน เรียง price, stock; ถ้าไม่ส่งทั้งคู่ คืน `["price","stock"]`
`ITEMS_UNAVAILABLE` มี `details.productIds` ครบทุกสินค้าที่ไม่ผ่าน
Customer อ่าน order ของคนอื่นหรือ ID ไม่มีอยู่ ได้ ORDER_NOT_FOUND เหมือนกัน
ข้อผิดพลาดของ checkout คืนผล validation ขั้นแรก: zone/speed → cart empty → unavailable lines → weight → แล้วจึงประเมิน coupon
Context stage ตรวจหลัง auth/role และก่อนตรวจ payload ตามกฎ FR-8

Notice COUPON_NOT_APPLICABLE อยู่ใน success `data.messages` (ไม่ใช่ HTTP error) หลังถอดคูปองเมื่อ checkout ผ่านเท่านั้น
หาก checkout ไม่ผ่าน 4 ขั้นแรก จะไม่มีการถอด coupon หรือจอง stock
payFail คืน info message และไม่มีการเปลี่ยน DB state

นอกเหนือ domain: `ROUTE_NOT_FOUND` 404, malformed JSON = VALIDATION_ERROR 400, body >32KB = VALIDATION_ERROR 413, unexpected = INTERNAL_ERROR 500, health ติดต่อ DB ไม่ได้ = DATABASE_UNAVAILABLE 503

## Test reset (DC-3)

ต้องเปิดทั้ง `NODE_ENV=test`, `ALLOW_TEST_RESET=true` และ `TEST_RESET_KEY` อย่างน้อย 24 ตัว มิฉะนั้น route นี้ไม่มีอยู่ (404)

```http
POST /api/testing/reset
X-Test-Reset-Key: <ค่า TEST_RESET_KEY>
```

Response: `{ "data": { "reset": true } }`
ล้างข้อมูลทุกตารางเฉพาะ schema bean และคืน seed P1/P2/P3/SAVE10/3 บัญชีตาม SRS รวมตะกร้า stage ออเดอร์ และ stock
**reset ลบ session ทั้งหมดด้วย จึงต้อง login ใหม่หลัง reset**
ส่ง key ผิดใน route ที่เปิดอยู่ → AUTH_FORBIDDEN 403. ห้ามส่ง key นี้เข้า frontend env

## เตรียมเขียน Playwright API tests ภายหลัง

ยังไม่มี config หรือ test code ในโครงการนี้ตามคำขอ เมื่อเริ่มเขียน:

1. ใช้ Supabase project สำหรับ test แยกจากข้อมูลอื่น เปิด test env และ reset
2. ติดตั้ง `npm install -D @playwright/test` และกำหนด `use.baseURL` เป็น `http://localhost:4000/api/`
3. ใช้ `request` fixture เรียก path แบบ relative เช่น `auth/login` (ไม่มี / นำหน้า เพราะ baseURL มี /api/)
4. reset → login → อ่าน `response.json().data.token` → ส่ง `Authorization: Bearer ...` ใน requests ที่ต้อง auth
5. อ้าง HTTP status, `error.code`, `error.details` และ monetary fields จาก contract นี้ โดย expected values ต้องคำนวณจาก SRS
6. อย่าใช้ business function ของระบบเป็น expected value ของ API test เพราะจะตรวจไม่เจอบั๊กที่ซ้ำกัน
7. เมื่อใช้ reset DB ชุดเดียวให้รัน serial (`workers:1`, `fullyParallel:false`) หรือแยก DB ต่อ worker ก่อนเพิ่ม parallelism
8. API testing ผ่าน HTTP ไม่ต้องติดตั้ง browser binaries; E2E จึงค่อยติดตั้ง browser
9. สำหรับ unit tests import pure functions จาก `backend/src/domain/pricing.ts`; สำหรับ API import createApp หรือรัน server จริง

เอกสารหลัก: https://playwright.dev/docs/api-testing
