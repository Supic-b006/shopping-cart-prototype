BEAN Unit Testing — Team Integration Verification
วันที่ 4 พฤศจิกายน 2026 (Asia/Bangkok)

สถานะ: **BLOCKED สำหรับการเผยแพร่** — การรวมและ unit checks ผ่าน แต่ backend/.env.example:3 เดิมมี URL ที่บรรจุ password ซึ่งไม่ปรากฏว่าเป็น placeholder ต้องให้เจ้าของตรวจสอบและ rotate หากเป็น credential จริงก่อน Push/PR ไม่แสดงค่าและไม่ทดสอบการเชื่อมต่อ

**ฐานและขอบเขตการรวม**

- Team เดิม: branch Unit-Test, commit 8c8ecd7cc0074168252d30f127cd5216243e503b
- origin: https://github.com/Supic-b006/shopping-cart-prototype.git
- ตรวจ working tree สะอาดก่อนเริ่ม; fetch origin สำเร็จโดยไม่ pull/merge; เทียบ origin/Unit-Test ได้ ahead 0 / behind 0 ณ เวลาตรวจ
- 39 tracked files ตรง historical Team baseline ก่อนรวม
- สร้าง branch test/bean-unit-srs-v1.8 จาก commit ข้างต้น; HEAD ยัง commit เดิม; ไม่เปลี่ยน main, ไม่ stage/commit/push/เปิด PR
- ADD 15 และ MERGE 4 ตาม docs/UNIT-TEST-HANDOFF-MANIFEST.json; ใช้ production ของ Team; Our workspace ไม่ถูกแก้
- SHA256 หลังรวม: 35/35 tracked files นอก 4 MERGE files ตรง baseline รวม backend/src 12/12, frontend, schema และ Team tests เดิม
- cartService.test.ts, domain.test.ts, http.test.ts, base Vitest/TS configs และ E2E คงเดิม

**Toolchain และความเข้ากันได้**

ใช้ Node 24.14.0, TypeScript 5.9.2, Team Vitest 5.1.0 และเพิ่ม @vitest/coverage-v8 5.1.0 แบบ exact ไม่ downgrade Team ไป 3.2.4
ติดตั้ง dependencies ด้วย npm --ignore-scripts --no-audit --no-fund; cache อยู่ evidence directory นอก Team repository
lockfile เกิดจาก npm resolve ของ Team ไม่คัดลอก Our lock; 9 package paths เพิ่ม, 2 nested paths ถูก hoist, ไม่มี existing package version ถูกเปลี่ยน
root/backend package scripts เดิมทั้งหมดคงเดิม; เพิ่ม test:unit, test:unit:team, test:coverage, typecheck:unit
npm test เดิมอาจเลือก HTTP tests จึงไม่ได้ใช้ในการตรวจนี้

backend/tsconfig.unit.json ใช้ ESNext/Bundler เพื่อ typecheck extensionless import ของ Team cartService.test.ts ตาม Vitest โดยไม่แก้ Team tests หรือ production tsconfig
backend/vitest.unit.config.ts เลือกเฉพาะ domain.test.ts กับ tests/unit/**/*.test.ts ไม่มี HTTP test/server/DB setup
Team cartService suite รันด้วยชื่อไฟล์เฉพาะ ไม่ได้เพิ่มเข้า Our coverage allowlist

พบ test-data adapter defect: it.each ของ quantity เดิมใช้ [] เป็นแถวอาร์กิวเมนต์ว่าง ทำให้ไม่ได้ส่ง array ตามเจตนา จึงห่อทุกค่าเป็น [quantity] และเพิ่ม %# ในชื่อแต่ละแถวใน pricing.test.ts:29 ไม่มีการเปลี่ยน expected result
Vitest 5 แสดงชื่อ parameterized cases ต่างจาก 3; migrate 134 selectors โดยตรวจ source/table order, per-file counts, ancestor titles และ statuses พร้อมเก็บ previous selector ใน history ของ stable IDs เดิม ไม่อนุมาน requirement จากชื่อ
generator เดิมไม่ถูกลดความเข้มงวด: ยัง reject duplicate/unknown/missing cases และตรวจ explicit evidence

**ผล execution จริงบน Team branch**

| ชุด/คำสั่ง | Passed | Failed | Skipped | TODO |
|---|---:|---:|---:|---:|
| npm run test:unit | 340 | 0 | 0 | 5 |
| npm run test:unit:team -w backend (cartService) | 556 | 0 | 0 | 0 |
| npm run test:domain -w backend (legacy) | 3 | 0 | 0 | 0 |
| npm run test:coverage (Our + legacy) | 340 | 0 | 0 | 5 |

Our suite รวม legacy domain 3 cases อยู่แล้ว; **ยอดไม่ซ้ำ 896 passed / 0 failed / 0 skipped / 5 TODO = 901 cases** ไม่บวกผล coverage/repeated runs เป็นกรณีเพิ่ม
แบบไม่ซ้ำ: Our-only 337 passed + 5 TODO, Team cartService 556 passed, Team legacy domain 3 passed

| Our files | Passed | TODO |
|---|---:|---:|
| tests/domain.test.ts | 3 | 0 |
| tests/unit/errors.test.ts | 17 | 0 |
| tests/unit/pricing.test.ts | 130 | 1 |
| tests/unit/shop.test.ts | 104 | 4 |
| tests/unit/srs-v18.test.ts | 80 | 0 |
| tests/unit/high-value.test.ts | 6 | 0 |

- npm run typecheck: backend source และ frontend noEmit ผ่าน exit 0
- npm run typecheck:unit: Our tests, Team cartService, legacy domain และ Vitest configs ผ่าน exit 0
- generator --check: 345 registry cases ตรง latest JSON/CSV ผ่าน
- รอบแรก root typecheck ไม่ผ่านเพราะ frontend dependencies ยังไม่ติดตั้ง; หลังติดตั้ง existing workspace dependencies ผ่าน ไม่แก้ source เพื่อกลบ failure
- รอบแรก traceability ไม่ผ่านชื่อซ้ำบน Vitest 5; แก้ adapter/selector ตามรายละเอียดข้างต้นแล้วผ่าน
- การตรวจ lockfile, source hashes, import graph และ secret patterns เป็น artifact inspection แยกจาก execution ไม่ใช่ integration verification
- ไม่รัน HTTP/integration/E2E/Playwright/server, migration, seed/reset หรือเชื่อม Supabase/DB

Latest execution artifacts (local-only, ignored):
- backend/test-results/unit-runs/2026-11-04T08-50-25-720Z-2212/results.json
- backend/test-results/unit-runs/2026-11-04T08-50-28-075Z-25288/results.json
- backend/test-results/team-runs/merge-2026-11-04T08-45-44-446Z/cartService.json
- backend/test-results/team-runs/merge-2026-11-04T08-45-44-446Z/domain.json

**Coverage จาก Vitest 5.1.0 / coverage-v8 5.1.0**

| Module | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| pricing.ts | 100% (44/44) | 100% (74/74) | 100% (14/14) | 100% (30/30) |
| shop.ts | 98.51% (133/135) | 92.68% (38/41) | 100% (42/42) | 100% (78/78) |
| errors.ts | 100% (15/15) | 94.73% (18/19) | 100% (3/3) | 100% (8/8) |
| รวม | **98.96% (192/194)** | **97.01% (130/134)** | **100% (59/59)** | **100% (116/116)** |

ขอบเขตมีเพียง backend/src/domain/{pricing,shop,errors}.ts ไม่รวม cartService.ts ของ Team, app/server, db/security, db, frontend, HTTP หรือ E2E
100% functions/lines จึงไม่ใช่ทั้ง backend และไม่พิสูจน์ความถูกต้องครบ SRS
ผลเก่า Our Vitest 3.2.4 คือ branches 97.87% (184/188) และ statements 100% (192/192) เป็น historical evidence; เปรียบเทียบเปอร์เซ็นต์ตรง ๆ กับ Vitest 5 ไม่ได้ เพราะ mapper/counting ต่างกัน ทั้งนี้ production source ไม่เปลี่ยน

coverage-summary.json และ coverage-final.json อยู่ backend/coverage/unit-runs/2026-11-04T08-50-28-075Z-25288/
4 branch outcomes ที่ hits=0 จาก artifact โดยตรง:
- errors.ts:9 branch 1 hits [102,101,0]: unknown-code message fallback
- shop.ts:10 branch 0 hits [0,276]: missing seeded cart
- shop.ts:65 branch 13 hits [0,48]: checkout invariant failed
- shop.ts:87 branch 14 hits [1,0]: secondary orderId tie-break เมื่อ createdAt เท่ากัน
2 uncovered statements: shop.ts:10 statement 6 และ shop.ts:65 statement 60; line mapping ของ Vitest 5 ยังคงรายงาน 100% lines ไม่ปกปิดข้อแตกต่างนี้
ไม่เพิ่ม corrupt-state/tie-break tests โดยเดา oracle เพื่อเพิ่ม coverage

**Requirement traceability และ oracle**

Primary authority: SRS-CART-002_v1.8_pubs.md v1.8 (document status Draft; ผู้ใช้กำหนดเป็นหลัก)
SHA256: 0C22E16996CC73F291D42B29D6DC7A0FC4DE2856B1F1E633FC25A86E2AC27D06
docs/UNIT-TEST-METADATA.json และ docs/UNIT-TEST-CASES-high-value.csv: 345 stable IDs, 312 specification-confirmed, 28 api-contract-only, 5 pending clarification; ไม่มี provisional executable oracle
คง requirement ranges, evidence และ legacy IDs/history ทุกกรณี การเปลี่ยน selector ไม่เปลี่ยน classification หรือ expected value
Registry นี้ครอบคลุม Our 345 cases รวม legacy 3 ไม่อ้างว่า audit oracle/traceability ของ Team cartService 556 cases ใหม่ทั้งหมดในรอบ integration นี้
Team cartService ทดสอบ backend/src/cartService.ts ซึ่งเป็นคนละ module กับ domain pricing ที่แอปใช้ ผลผ่านแยกชุดจึงเป็น regression compatibility ไม่ใช่หลักฐานว่าชุดหนึ่งแทนอีกชุดได้

High-value cases ที่นำมารวม:
- UT-276–278 / FR-4.4.1: subtotal 1/19/20 ให้ prime discount 0/0/1 ไม่ assert source label เมื่อ discount=0
- UT-279 / FR-3.3: coupon ใช้ซ้ำในสองออเดอร์ที่ paid สำเร็จ
- UT-280 / FR-9.2.1–9.2.2: สองลูกค้าเห็นราคาใหม่ใน cart และ paid order snapshots ทั้งสองคงเดิม
- UT-281 / FR-6.2–6.3: payFail 3 ครั้งไม่เปลี่ยน State ก่อน paySuccess
จำนวน finite cases ไม่พิสูจน์ unlimited repetitions; snapshots ใช้ตรวจ invariants ส่วน amounts ใช้ literal expectations จาก SRS

| TODO ID | Requirement | สิ่งที่ขาด / หลักฐานที่ต้องเพิ่ม |
|---|---|---|
| UT-105 | FR-4.5, DC-1 / SOI-1 | ขอบ weight เริ่ม 1g; ต้องกำหนด input precondition หรือผล classifyWeight(0) |
| UT-204 | FR-8.1, FR-8.5.1 / SOI-2 | ต้องกำหนด precedence เมื่อ stage ผิดและ payload ผิดพร้อมกัน; API.md เลือก stage first แต่ยังไม่ใช่ SRS decision |
| UT-205 | FR-0.6 / SOI-4 | ต้องระบุ secondary ordering เมื่อ createdAt เท่ากัน หรือยืนยันว่าไม่กำหนดลำดับ |
| UT-232 | FR-6.1–6.2 / SOI-5 | ต้องระบุ invariant/allowed inputs สำหรับ payFail เมื่อ internal currentOrderId ขัดกับ pending order |
| UT-236 | FR-6.1–6.2 / SOI-5 | ต้องระบุ invariant/allowed inputs สำหรับ paySuccess ใน State ไม่สอดคล้องเดียวกัน |

คง TODO ทั้ง 5 ไม่มี expected ใหม่จาก production; exact API message/empty-patch fields และ zero-discount source label ไม่ถูกอ้างเป็นข้อสรุป SRS

**GitHub handoff และ security**

ADD 15 files และ MERGE 4 files อยู่ใน manifest; git diff --stat ของ tracked changes: 4 files, 134 insertions, 32 deletions (ไม่รวม 15 untracked additions)
ไม่มี staged files; source/test hashes ยืนยันไม่ทับงาน Team; .env.example คงเดิมเพื่อไม่แก้ secret/history โดยพลการ
candidate allowlist ไม่มี .env, node_modules, cache, coverage/test-results, staging/history ZIP หรือ credentials ที่ตรวจพบด้วย pattern scan (ไม่ใช่การรับรองว่าไม่มี secret ทุกชนิด)
dependency/evidence directories เก็บในเครื่อง ไม่ส่ง GitHub; historical CSV/metadata/reports ก่อนปรับเก็บเพิ่มที่ ../unit-merge-evidence-2026-11-04T08-40-38-575Z/before/
หลักฐานคำสั่ง/exit codes อยู่ command-runs.json, selector-migration.json และ final-verification.json ใน evidence directory เดียวกัน; ไม่ทับ historical evidence ของ Our

Push Blocker: tracked backend/.env.example:3 มี database URL พร้อม non-placeholder password/host และลักษณะ Supabase; ไม่ได้ยืนยันว่าใช้ได้จริง ไม่พิมพ์ค่าและไม่เชื่อมต่อ
เจ้าของต้องตรวจสอบและ revoke/rotate หากเป็นของจริง พร้อมจัดการ sanitized example และประเมินประวัติ Git ก่อน Push ภายใต้การอนุญาตแยก ไม่ rewrite history เอง
การรวม unit testing พร้อมให้ review ใน branch นี้ แต่ยังไม่ประกาศ READY_TO_COMMIT/PR จน blocker ถูกจัดการ; ไม่ commit/push/เปิด PR ในรอบนี้
