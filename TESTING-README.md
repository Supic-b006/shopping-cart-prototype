# BEAN Combined Testing — Quick Start

ใช้ Node.js 24 LTS และ npm เปิด terminal ที่โฟลเดอร์ที่มี package.json หลัง clone หรือแตก ZIP
ไม่ต้องมี Git เพื่อรันโปรเจกต์จาก ZIP

```powershell
npm ci --ignore-scripts --no-audit --no-fund --cache .npm-cache
npm run test:env:init
npm run test:browsers
npm test
npm run typecheck
npm run typecheck:unit
npm run typecheck:e2e
npm run build
```

`npm test` รัน unit สองชุดโดยไม่รัน DB: Our 340 passed / 5 TODO และ Team 556 passed รวมไม่ซ้ำ 896 passed / 5 TODO
ตัวเลขนี้เป็น baseline; ผลจริงของแต่ละรอบต้องอ่านจาก runner ห้ามเปลี่ยน expected results เพื่อให้ผ่าน

## เตรียมฐานข้อมูลทดสอบ

1. ให้เจ้าของยืนยัน project identity, host/database และอนุญาต migration/seed/reset ทั้ง 7 ตารางใน schema bean ก่อนใช้งาน
2. `npm run test:env:init` สร้าง `.env.e2e` ที่ Git ignore และไม่เขียนทับไฟล์เดิม
3. เจ้าของใส่ credential **ใหม่** ในไฟล์นี้ผ่านช่องทางส่วนตัว ห้ามใช้ค่าจาก tracked example หรือ Git history และห้ามส่ง secret ใน chat/report
4. กำหนด `TEST_DATABASE_HOST` เป็น hostname เท่านั้น, `TEST_DATABASE_PORT` เป็น port, `TEST_DATABASE_NAME` เป็นชื่อ database และ `TEST_DATABASE_USER` เป็น DB user ที่เจ้าของยืนยันอิสระจาก URL (pooler อาจใช้ host/database ร่วมกันหลาย project); เมื่ออนุมัติแล้วตั้ง `TEST_DATABASE_CONFIRMED=true`
5. ตั้ง `DATABASE_SSL=true`, `NODE_ENV=test`, `RUN_DB_TESTS=true`, `SEED_PASSWORD` อย่างน้อย 8 ตัว และ `TEST_RESET_KEY` อย่างน้อย 24 ตัว
6. สำหรับ setup/Integration/E2E เปิด `ALLOW_TEST_RESET=true` และ `E2E_ALLOW_RESET=true` เมื่อได้รับอนุญาตให้ล้างข้อมูลแล้ว
7. ใช้ PostgreSQL URL ที่ไม่มี query parameters เพื่อไม่ให้ pg overrides เปลี่ยน target/TLS; ถ้าจำเป็นต้องใช้ CA ให้ `DATABASE_CA_FILE` เป็น absolute path ของไฟล์ที่อนุมัติ
8. อย่ารัน suites พร้อมกันหรือแชร์ DB กับงานอื่น; ports 4000/5173 ต้องว่าง ใช้ managed servers และ bundled Chromium

```powershell
npm run test:env
# คำสั่งข้างต้นตรวจ offline เท่านั้น ไม่พิสูจน์ว่า credential ใช้งานได้

# หลังอนุมัติ setup เท่านั้น:
npm run db:migrate
npm run db:seed

# รันทีละคำสั่ง และหยุดหากคำสั่งใดล้มเหลว:
npm run test:integration
npm run test:http
npm run test:e2e
```

`db:migrate:e2e`/`db:seed:e2e` เป็น aliases ของ setup เดียวกัน ไม่ต้องรันซ้ำ
หลัง setup แล้ว `npm run test:all` รัน Unit → TypeScript → Build → Integration → HTTP → E2E แบบเรียงลำดับและหยุดเมื่อคำสั่งล้มเหลว ไม่ทำ migration/seed ให้อัตโนมัติ

## คำสั่งและผลกระทบ

| คำสั่งจาก root | ผลกระทบ/ผลที่คาด |
|---|---|
| `npm run test:unit` | Our + legacy domain, 340 passed / 5 TODO; ไม่ใช้ DB |
| `npm run test:unit:team` | cartService 556 cases; ไม่ใช้ DB |
| `npm run test:coverage` | Coverage เฉพาะ domain ที่ config กำหนด |
| `npm run test:infrastructure` | Offline environment guards; นับแยกจาก business unit baseline |
| `npm run test:integration` | 133 cases; reset ทั้ง 7 ตารางก่อนทุก case และทำ API mutations |
| `npm run test:http` | 1 case; health/login และเพิ่ม session; root runner ปิด reset endpoint |
| `npm run test:e2e` | 29 cases; เปิด backend/frontend, reset ก่อนทุก case, มี trace/video |
| `npm run db:migrate` | สร้าง schema และปรับ function/trigger/permissions |
| `npm run db:seed` | Insert ข้อมูลที่ยังไม่มี; ไม่ reset/แก้ข้อมูลที่มีอยู่แล้ว |

DB runner ต้องได้จำนวน passed ครบ ไม่มี failed/skipped/TODO จึงสำเร็จ; flags ไม่ครบจะหยุดก่อน import แอป/เปิด connection ไม่ถือว่า skipped คือผ่าน
รันผ่าน root scripts ที่ตรวจ environment; backend scripts เดิมคงไว้เพื่อรักษางานสมาชิก แต่เป็น low-level commands ที่ไม่ได้ผ่าน target guard นี้

## Environment และหลักฐาน

Integration/HTTP/E2E/setup ผ่าน root scripts ใช้ `.env.e2e` ชุดเดียว และไม่รับ DB/PG overrides ที่ค้างใน terminal เป็น target ใหม่
Frontend ใช้ `http://127.0.0.1:5173`, backend ใช้ `http://127.0.0.1:4000`; `VITE_API_ORIGIN` ต้องว่าง
Browser/cache อยู่ `.playwright-browsers/` และ `.npm-cache/` ภายในโปรเจกต์และถูก ignore
ผล DB suites อยู่ `test-results/runtime/<run>/`; E2E มี JSON, HTML และ artifacts เพิ่ม ส่วน actor videos อยู่ `test-results/actor-videos/`
Unit JSON อยู่ `backend/test-results/unit-runs/`; เก็บ SHA หรือ source snapshot ของแต่ละรอบพร้อมผลจริง
อย่าแชร์ raw logs/trace/video ก่อนตรวจรหัสผ่าน, reset key และ authorization tokens

**SECURITY_PENDING:** tracked database example เดิมยังมี credential-shaped URL และ DB pool เดิมยังใช้ `rejectUnauthorized:false`
`DATABASE_SSL=true` ใน runner ไม่ใช่การแก้ certificate verification; รอบนี้ไม่ได้ทำ TLS/security refactor
เจ้าของต้องจัดการ credential เดิมและยืนยัน test target; ห้ามใช้ข้อมูล production หรือ credential ที่เผยแพร่แล้ว
การ reset จะล้าง accounts, sessions, products, coupons, customer_carts, cart_items, orders ไม่คืนข้อมูลเดิมหลังจบ suite และไม่มี auto-cleanup หลังรัน

ไม่มีคำสั่งใดในคู่มือนี้อนุญาต push/PR/merge main
