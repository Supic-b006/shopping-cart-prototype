# ข้อกำหนดกับ implementation

| ข้อกำหนด | จุดที่รองรับ |
|---|---|
| FR-0 auth/role/ownership | `app.ts` authenticate + `Shop.customer/admin/order/orders`; data อ่านจาก token ไม่รับ userId จาก body |
| FR-0.7 error ไม่เปลี่ยนข้อมูล | `transaction` rollback; service ตรวจ validation ก่อนเขียน; login ไม่รีเซ็ต cart |
| FR-1.1–1.4 | seed ตามส่วน 7; cart/stage/current order เก็บใน DB; product filtering ใช้ isProductAvailable |
| FR-2.1–2.6 | validateQuantityChange ตาม 6 ขั้นแบบไม่ coerce ตัวเลข |
| FR-2.7–2.9 | remove, cart projection ปัจจุบัน, UI disabled checkout ตาม stage/line count |
| FR-3 | coupon ผูกได้แม้ cart ว่าง ไม่ตรวจยอดขั้นต่ำขณะผูก เปรียบเทียบ exact string |
| FR-4 | pure pricing functions: floor ทุกผลทศนิยม, coupon/member ไม่ทบ, weight tiers และ rate table |
| FR-5 | validateCheckout ก่อน coupon; สร้าง UUID snapshot และ reserve stock ใน transaction เดียว |
| FR-5.3.10 | ไม่มี timeout หรือ auto-release; การจองคงอยู่จน paySuccess/cancel เท่านั้น |
| FR-6 | payment success ล้าง cart/coupon, success stage; fail เป็น info ไม่แก้ state และลองซ้ำได้ |
| FR-7 | cancel บวก snapshot quantity เข้าสต็อกปัจจุบัน คง cart และ coupon ที่ยังผูกไว้ |
| FR-8 | stage guards ใน service; read operations ทำได้ทุก stage |
| FR-9 | product exists ก่อน validate ทุก field, stock คือค่าพร้อมขายใหม่, snapshot ไม่ตามราคาใหม่ |
| FR-10 | status มีผลตอน checkout ถัดไป; coupon list แสดงทั้งหมด |
| DC-1 | `domain/pricing.ts` export signatures TypeScript ครบ 10 ฟังก์ชัน route → Shop → ฟังก์ชันเหล่านี้ |
| DC-2.1–2.3 | HTML semantic controls และ labels เชื่อมด้วย htmlFor/id |
| DC-2.4–2.11 | test ID ตามตาราง 6.2.1, data-value/data-status/data-available, app-message และ disabled |
| DC-2.12–2.13 | React Router direct URLs และ stage redirect; Vercel SPA fallback |
| DC-3.1–3.2 | test-only reset บังคับ secret และ environment flags |
| DC-3.3 | gateway buttons เฉพาะ testMode ที่อ่านจาก backend /config |

## การออกแบบที่เลือกเพิ่มจาก SRS

- HTTP path, JSON envelopes, English enum, status mapping และ authentication เป็น API contract ที่โครงการนี้เลือกเอง (ดู API.md)
- stage `cart`, `checkout`, `success` ตรงกับ ตะกร้า, ชำระเงิน, สำเร็จ
- order status `pending`, `paid`, `cancelled` ตรงกับ รอชำระเงิน, ชำระเงินแล้ว, ยกเลิก
- product/coupon status เป็น boolean `isOnSale`, `active`; UI data-status เป็นสตริง `true` / `false` ตามค่าจาก API
- บัญชี seed ใช้ password จาก SEED_PASSWORD; SRS ไม่กำหนดรหัสผ่าน
- ไม่ส่ง price หรือ discount จาก frontend ไปใช้ตัดยอด การคำนวณยึดข้อมูล backend เท่านั้น
- UI อนุญาต `/orders` และ `/orders/{id}` ในทุก stage ตาม FR-8.5.2; หน้า workflow `/products`, `/cart`, `/checkout`, `/success` redirect ให้ตรง stage
- Snapshot เก็บ JSONB ใน `orders` ซึ่งมีรายการและยอดครบพร้อม trigger ป้องกันแก้ snapshot; ไม่ต้อง join ราคาสินค้าปัจจุบันเพื่อดูออเดอร์เดิม
- ไม่มีการสร้างสินค้า/คูปองใหม่ ไม่มี registration ไม่มี gateway จริง ตาม out-of-scope

## Specification gaps สำหรับบันทึก SOI

ตาม SRS ส่วน 9 ข้อที่เอกสารไม่กำหนดต้องบันทึกไว้และยังไม่ใช้ behavior ที่ implement เป็น expected value ของ test:

| SOI | ประเด็นที่ SRS ไม่กำหนดชัด | ตัวเลือกที่ implement เพื่อให้รันได้ |
|---|---|---|
| SOI-1 | น้ำหนัก 0 ใน classifyWeight | คืน light; checkout ปฏิเสธ cart ว่างก่อนคำนวณ shipping อยู่แล้ว |
| SOI-2 | ลำดับ error เมื่อผิด stage และ payload ผิดพร้อมกัน | ตรวจ auth → role → stage → validation ของ operation |
| SOI-3 | updateProduct ไม่ระบุทั้ง price/stock ต้องคืน fields รายชื่อใด | คืน VALIDATION_ERROR, fields=[price,stock] |
| SOI-4 | ลำดับออเดอร์ที่ createdAt เท่ากัน | เรียง orderId มากไปน้อยเป็น tie-breaker |

รายการ SOI ไม่เปลี่ยนกฎที่ SRS กำหนดไว้แล้ว เช่น product exists ก่อนตรวจ admin fields และ quantity validation ตามลำดับ FR-2.6
