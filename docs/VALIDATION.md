# ผลตรวจ 31 ตุลาคม 2026

## ตรวจแล้ว

- TypeScript ของ frontend และ backend ผ่าน
- Production build ของทั้งสองส่วนผ่าน
- ใช้ Playwright APIRequestContext ยิง HTTP จริงเข้า Express กับ PostgreSQL-compatible engine ชั่วคราว (PGlite) ผ่าน 94 response checks ครอบคลุม flow หลักใน SRS ส่วน 8
- ตรวจ auth/role, validation priority, error ไม่เปลี่ยน cart/stock, subtotal/discount/shipping/total, coupon notice, user isolation, persistent checkout, immutable snapshots, reservation และ cancellation คืนเข้าสต็อกปัจจุบัน
- ตรวจว่า gateway/reset routes ไม่เปิดใน production และ reset ไม่เปิดถ้า ALLOW_TEST_RESET=false
- ตรวจ browser flow ด้วย Chromium: login, validation message, add products, cart, coupon, checkout, payment fail/retry/success, continue shopping, orders/detail, admin product/coupon, direct URL stage redirect และ mobile overflow ที่ความกว้าง 390px
- ไม่พบ uncaught page errors ใน browser flow ที่ตรวจ
- เปลี่ยนฟอนต์เป็น dependency ที่เสิร์ฟพร้อมเว็บเพื่อรองรับภาษาไทยแม้โหลด Google Fonts ไม่ได้
- npm audit ของ dependency tree ที่ตรวจไม่พบ advisory หลังอัปเดต dependencies ที่มีรายการแจ้งเตือน (ดูข้อจำกัดด้านล่าง)

## ขอบเขตและสิ่งที่ต้องตรวจหลังตั้งค่า

- ยังไม่ได้เชื่อม Supabase Cloud ของผู้ใช้ เพราะยังไม่มี DATABASE_URL / database password
- การตรวจ SQL ใช้ PostgreSQL-compatible engine ชั่วคราว พร้อม adapter ให้ repository ใช้ SQL เดิม ไม่ได้พิสูจน์ TLS, DNS, pooler, credentials หรือการอนุญาตของ Supabase project จริง
- เมื่อใส่ environment ให้รัน migration → seed → health และลอง checkout ตาม README บน Supabase จริงอีกครั้ง
- ไม่ได้อ้างว่าผ่านทุก requirement ทุก boundary หรือ production security review; ไม่มี load/race-condition tests (นอก scope SRS)
- npm audit เป็นสถานะของ advisory database ในขณะตรวจ ไม่ใช่การรับรองว่าไม่มีช่องโหว่
- ไม่มี gateway รับเงินจริง และไม่มี payment verification สำหรับ production

ไม่มีไฟล์เทสหรือ Playwright dependency/config ถูกเพิ่มในชุดส่งมอบตามคำขอ การตรวจข้างต้นใช้เครื่องมือชั่วคราวแยกจาก source ที่ส่งให้
