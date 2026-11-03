# Playwright AC-1 ถึง AC-19b (23 tests)

ชุดนี้ใช้กับ BEAN / cart-supabase-supabase-adapted-v2 และ API /api/auth/login, /api/checkout เท่านั้น ไม่ใช่ mock CARTORY API /api/sessions

## 1. สร้าง branch ในเครื่องคุณ
เปิด CMD ที่โฟลเดอร์หลัก ตรวจ `git status` และ commit งานค้างที่ตรวจแล้วก่อน จากนั้น:

```cmd
git switch -c test/playwright-acceptance
```

ชุดดาวน์โหลดนี้เป็นไฟล์สำหรับนำไปวางใน branch ของคุณ ไม่ได้สร้าง branch บนเครื่องหรือ GitHub ให้โดยอัตโนมัติ

## 2. วางไฟล์
คัดลอก playwright.config.ts, tests/e2e/, .env.e2e.example และคู่มือนี้ ไปที่โฟลเดอร์หลักของโปรเจกต์ ระดับเดียวกับ backend/ และ frontend/ หากมี test เดิมให้สำรอง/เทียบก่อนแทนที่

```cmd
npm install -D @playwright/test
npx playwright install chromium ffmpeg
copy .env.e2e.example .env.e2e
notepad .env.e2e
```

ใช้ Node >=22.12 ใส่ connection string ของ Supabase TEST PROJECT แยกต่างหากเท่านั้น แต่ละ test reset ตาราง bean รวม accounts/sessions/carts/orders/products/coupons ใหม่ทั้งหมด ห้ามใช้ฐานข้อมูลที่มีข้อมูลจริงหรือเปิดใช้งานร่วมกับผู้อื่นขณะรัน
รหัสผ่าน SEED_PASSWORD เป็นรหัสผ่าน login ของเว็บ ไม่ใช่รหัสผ่าน PostgreSQL ใช้รหัสผ่านฐานข้อมูลแบบ percent-encoded ใน DATABASE_URL
คง DATABASE_SSL=true และใช้ DATABASE_CA_FILE ชี้ไปยัง CA certificate เมื่อจำเป็น ไม่ควรปิดการตรวจ certificate
หาก frontend/.env มี VITE_API_ORIGIN ให้เว้นว่างเพื่อให้ใช้ proxy ไป 4000
เพิ่ม .env.e2e, playwright-report/, test-results/ ใน .gitignore (เก็บ .env.e2e.example ขึ้น Git ได้เพราะไม่มี secret จริง)

## 3. ตรวจ app.ts ก่อน
กำหนด `const testMode = process.env.NODE_ENV === 'test';` และ `const demoPaymentsEnabled = testMode || process.env.NODE_ENV === 'development';`
ใช้ demoPaymentsEnabled สำหรับ gateway และ /api/config (ส่ง `{data:{testMode:demoPaymentsEnabled}}` เพื่อคง frontend เดิม)
ใช้ if แยกต่างหากสำหรับ reset: `if (testMode && process.env.ALLOW_TEST_RESET === 'true' && (process.env.TEST_RESET_KEY?.length ?? 0) >= 24)` โดยคงการตรวจ X-Test-Reset-Key และ transaction ของ route เดิม ห้าม reset อยู่ในบล็อก gateway โดยไม่มี testMode

## 4. สร้างตารางในฐานข้อมูลทดสอบ
หยุด npm run dev เดิม (Ctrl+C) เพื่อไม่ให้พอร์ตชน แล้วรันที่โฟลเดอร์หลัก:

```cmd
node --env-file=.env.e2e --import tsx backend/src/db/manage.ts migrate
node --env-file=.env.e2e --import tsx backend/src/db/manage.ts seed
npx playwright test --list
```

ควรพบ 23 tests การ list ยังไม่พิสูจน์ว่า tests ผ่าน
config จะเปิด API และ frontend ให้เอง โดยตั้ง NODE_ENV=test และไม่ reuse server เดิม ถ้ามี environment variable ใน terminal อยู่แล้ว Node loadEnvFile จะไม่เขียนทับ จึงควรใช้ terminal ใหม่ที่ไม่มี DATABASE_URL/SEED_PASSWORD ค้างจากงานอื่น

## 5. เปิด browser ให้เห็นการคลิกเหมือน workshop

```cmd
npx playwright test --headed
npx playwright test tests/e2e/pricing.spec.ts --headed
npx playwright test -g "AC-4:" --headed
```

ตั้ง E2E_SLOWMO=250 ใน .env.e2e เพื่อให้มองตามการคลิกได้ ลดเป็น 0 เพื่อรันเร็ว การชะลอไม่ใช่ assertion ใช้ expect รอผลจริงเสมอ

โหมด UI เลือก test และดูแต่ละ action:

```cmd
npx playwright test --ui
```

โหมด debug ทำทีละ action:

```cmd
npx playwright test -g "AC-4:" --debug
```

## 6. คลิปวิดีโอและ Trace
config ตั้ง video:'on' และ trace:'on' จึงเก็บทุก test รวม test ที่ผ่าน คลิปเป็น .webm ไม่ใช่ .mp4 และไม่ใช่วิดีโอทั้ง desktop พร้อมเสียง

```cmd
npx playwright test
npx playwright show-report
```

เปิดรายการ test ใน report แล้วดู Video/Trace ไฟล์อยู่ test-results/ ส่วน actor เพิ่มเติม (Admin/Customer อีกคน) บันทึกแยกไว้ test-results/actor-videos/ อยากดู cursor/ตัว runner ทั้ง desktop ให้ใช้ screen recorder เช่น OBS หรือ Snipping Tool ขณะ --headed

## 7. codegen ตาม workshop
codegen คือบันทึกการคลิกเป็นโค้ด ไม่ใช่ไฟล์คลิป ต้องเปิดเว็บและ API เองก่อนใช้ โดยใช้ environment ของฐานข้อมูลทดสอบ ห้ามรัน codegen พร้อม acceptance suite เพราะ suite reset DB

```cmd
npx playwright codegen http://127.0.0.1:5173/login
```

ใช้โค้ดที่ recorder สร้างเป็นจุดเริ่มต้น แล้วเพิ่ม assertion ของ SRS เอง การคลิกสำเร็จอย่างเดียวไม่ได้แปลว่า AC ผ่าน ไม่เพิ่มช่อง Name/Email ตามเว็บ coffee ใน workshop เพราะ SRS ของงานนี้ไม่มี requirement นั้น

## 8. ไฟล์และ AC
|ไฟล์|AC|
|---|---|
|cart.spec.ts|1, 2, 3|
|pricing.spec.ts|4, 5, 6, 7, 8, 9|
|inventory.spec.ts|10, 11a, 11b, 11c, 12, 13|
|permissions.spec.ts|14, 15, 16, 17|
|payment.spec.ts|18a, 18b|
|coupons.spec.ts|19a, 19b|

fixtures.ts reset ข้อมูลก่อนทุก test; helpers.ts รวม login/locator/action/read API; แต่ละ test ไม่พึ่งผลจาก test ก่อนหน้า แม้ชื่อ 19b ก็เตรียม coupon ปิดใช้ของตัวเอง
AC-11c/14/17 เป็น API acceptance ผ่าน Playwright หลัง login ใน browser เพราะ UI ซ่อนสินค้าหรือไม่อนุญาต operation นั้น ไม่มีการคลิกจำลองสำหรับ request เหล่านี้ คลิปจึงไม่มีปุ่มให้เห็นในบางขั้น โดยแสดงหลักฐาน assertion/API แทน
AC-7/10/11b/13 ใช้หลาย browser context แยก session คนละผู้ใช้ ข้อมูลยังแชร์ผ่าน DB จริง
AC-13 อ่าน cart ผ่าน API เพราะ UI stage guard ไม่ให้เปิดหน้า cart ขณะ checkout แต่ SRS อนุญาต viewCart ในทุก stage
วิดีโอเป็นหลักฐานประกอบ ผล assertion เท่านั้นที่ตัดสิน passed/failed ห้ามแก้ expected ให้ตรงกับบั๊กของโปรแกรม

## 9. เก็บบน branch
ตรวจ git diff และ git status ให้แน่ใจว่าไม่มี .env.e2e, รหัสผ่าน หรือคลิปส่วนตัวถูก staged แล้ว add เฉพาะไฟล์ config/tests/คู่มือ/package files และ commit บน branch ใหม่
การผ่าน 23 AC ยังไม่ใช่การพิสูจน์ทุก FR/DC ทุก boundary ของ SRS

## ผลตรวจในสภาพแวดล้อมผู้จัดทำ
ดู VALIDATION-E2E.txt ในชุดดาวน์โหลด ระบุแยกการตรวจด้วย PostgreSQL-compatible engine ชั่วคราวจากการเชื่อม Supabase จริง ผู้ใช้ต้องรันกับ Supabase test project ของตนเองอีกครั้ง
