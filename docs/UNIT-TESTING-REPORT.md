BEAN Unit Testing — Team Integration Verification
วันที่ 4 พฤศจิกายน 2026 (Asia/Bangkok)

สถานะล่าสุด: ผลทดสอบจาก GitHub Fresh Clone ผ่าน; รอบนี้ปรับเอกสารให้ตรง actual delivery **14 ADD + 4 MERGE** ผล audit ก่อนแก้เอกสารคือ CHANGES_REQUIRED และยังไม่ประกาศ READY_FOR_PR จนเจ้าของ Backend ตรวจสอบ Credential Finding ที่แยกไว้ท้ายรายงาน

**ผล GitHub Audit ล่าสุด — แยกจากประวัติรอบ integration**

- Branch: test/bean-unit-srs-v1.8; audited commit: 845b72b7a2a7ae396888916f54c005f46a448af7
- Base Unit-Test: 8c8ecd7cc0074168252d30f127cd5216243e503b; diff จริง 14 ADD + 4 MERGE ตรง github_add/github_merge ใน UNIT-TEST-HANDOFF-MANIFEST.json
- Fresh Clone จาก GitHub: npm ci --ignore-scripts --no-audit --no-fund สำเร็จ; dependency tree และ lockfile consistency ผ่าน
- Our 340 passed / 5 TODO, Team cartService 556 passed, legacy domain 3 passed ซึ่งอยู่ใน Our แล้ว: รวมไม่ซ้ำ **896 passed / 0 failed / 0 skipped / 5 TODO**
- Vitest และ coverage-v8 5.1.0: branch coverage **97.01% (130/134)** เฉพาะ pricing.ts, shop.ts, errors.ts; statements 98.96%, functions/lines 100%
- typecheck และ typecheck:unit ผ่าน; traceability generator/--check ผ่าน **345 cases**: 312 specification-confirmed / 28 api-contract-only / 5 pending clarification
- CSV ที่ส่งมอบตรงผลรันใหม่ทุกคอลัมน์ข้อมูลทดสอบ ต่างเพียง verification_artifact ซึ่งเป็น path ของแต่ละ run
- ไม่พบ production/frontend/database/tests เดิมของทีมถูกเปลี่ยน ไม่พบ secret ใหม่จาก pattern scan ของ changes และไม่พบ generated artifacts ที่ไม่ควรส่ง
- ไม่พบ SRS ฉบับเต็มหรือหมายเหตุสำหรับผู้สอนใน branch/8 commits ที่ audit; การอ้างอิง SRS สำหรับผู้ตรวจระบุไว้ในส่วน Requirement traceability
- หลักฐาน audit เก็บ local-only แยกจาก repository ใน workspace: bean-github-audit-20261104/BEAN-GITHUB-AUDIT-TH.md, execution-audit.json, final-checks.json และ command logs ไม่ใช่ไฟล์ส่งมอบเพิ่มเติม

ส่วนประวัติด้านล่างเก็บผลรอบ integration เดิมไว้ รวมสถานะ BLOCKED สำหรับการเผยแพร่, HEAD/local staging ในเวลานั้น และข้อจำกัดที่ยังไม่เคย clean npm ci ส่วน status/limitations/evidence paths ใน manifest เป็นบันทึกรอบเดิม; ใช้รายการ github_add/github_merge ของ manifest เป็นรายการส่งมอบปัจจุบัน

**ประวัติ: ฐานและขอบเขตการรวม**

- Team เดิม: branch Unit-Test, commit 8c8ecd7cc0074168252d30f127cd5216243e503b
- origin: https://github.com/Supic-b006/shopping-cart-prototype.git
- ตรวจ working tree สะอาดก่อนเริ่ม; fetch origin สำเร็จโดยไม่ pull/merge; เทียบ origin/Unit-Test ได้ ahead 0 / behind 0 ณ เวลาตรวจ
- 39 tracked files ตรง historical Team baseline ก่อนรวม
- สร้าง branch test/bean-unit-srs-v1.8 จาก commit ข้างต้น; HEAD ยัง commit เดิม; ไม่เปลี่ยน main, ไม่ stage/commit/push/เปิด PR
- รายการรอบเดิมเคยระบุ ADD 15 รวม SRS ฉบับเต็ม; รายการส่งมอบปัจจุบันแก้เป็น ADD 14 และ MERGE 4 ตาม docs/UNIT-TEST-HANDOFF-MANIFEST.json และผล GitHub Audit; ใช้ production ของ Team; Our workspace ไม่ถูกแก้
- SHA256 หลังรวม: 35/35 tracked files นอก 4 MERGE files ตรง baseline รวม backend/src 12/12, frontend, schema และ Team tests เดิม
- cartService.test.ts, domain.test.ts, http.test.ts, base Vitest/TS configs และ E2E คงเดิม

**ประวัติ: Toolchain และความเข้ากันได้ในรอบ integration**

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

**ประวัติ: ผล execution จริงบน Team local branch (ผล Fresh Clone ล่าสุดตรงกัน)**

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

Execution artifacts ของรอบ integration เดิม (local-only, ignored; ไม่ใช่ paths ของ Fresh Clone audit):
- backend/test-results/unit-runs/2026-11-04T08-50-25-720Z-2212/results.json
- backend/test-results/unit-runs/2026-11-04T08-50-28-075Z-25288/results.json
- backend/test-results/team-runs/merge-2026-11-04T08-45-44-446Z/cartService.json
- backend/test-results/team-runs/merge-2026-11-04T08-45-44-446Z/domain.json

**Coverage จาก Vitest 5.1.0 / coverage-v8 5.1.0 — ผลรอบ integration และ Fresh Clone ตรงกัน**

| Module | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| pricing.ts | 100% (44/44) | 100% (74/74) | 100% (14/14) | 100% (30/30) |
| shop.ts | 98.51% (133/135) | 92.68% (38/41) | 100% (42/42) | 100% (78/78) |
| errors.ts | 100% (15/15) | 94.73% (18/19) | 100% (3/3) | 100% (8/8) |
| รวม | **98.96% (192/194)** | **97.01% (130/134)** | **100% (59/59)** | **100% (116/116)** |

ขอบเขตมีเพียง backend/src/domain/{pricing,shop,errors}.ts ไม่รวม cartService.ts ของ Team, app/server, db/security, db, frontend, HTTP หรือ E2E
100% functions/lines จึงไม่ใช่ทั้ง backend และไม่พิสูจน์ความถูกต้องครบ SRS
ผลเก่า Our Vitest 3.2.4 คือ branches 97.87% (184/188) และ statements 100% (192/192) เป็น historical evidence; เปรียบเทียบเปอร์เซ็นต์ตรง ๆ กับ Vitest 5 ไม่ได้ เพราะ mapper/counting ต่างกัน ทั้งนี้ production source ไม่เปลี่ยน

Artifacts ของรอบ integration เดิม: coverage-summary.json และ coverage-final.json อยู่ backend/coverage/unit-runs/2026-11-04T08-50-28-075Z-25288/
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
SRS v1.8 เป็นเอกสารอ้างอิงสำหรับการออกแบบ Tests และจะจัดหาให้ผู้ตรวจผ่านช่องทางที่ได้รับอนุญาต โดยผู้ส่งมอบเป็นผู้ประสานการเข้าถึง ไม่รวม SRS-CART-002_v1.8_pubs.md ฉบับเต็มในรายการ ADD/MERGE และไม่แนะนำให้อัปโหลดฉบับที่มีหมายเหตุสำหรับผู้สอนขึ้น GitHub
ชื่อไฟล์, SHA256 และเลขบรรทัดใน metadata/CSV ระบุฉบับต้นทางที่ใช้ ไม่ได้ยืนยันว่าเอกสารนั้นอยู่ใน checkout; ผู้ตรวจต้องได้รับสิทธิ์เข้าถึงแหล่งอ้างอิงแยก หากใช้ฉบับเผยแพร่ที่ตัดหมายเหตุแล้ว ต้องจัดทำคำอธิบายความสัมพันธ์ของฉบับและเลขบรรทัด ไม่ถือว่า hash ของสองฉบับเท่ากัน
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

**GitHub handoff ปัจจุบันและประวัติการส่งมอบ**

รายการปัจจุบัน: ADD 14 files และ MERGE 4 files ตาม manifest รวม 18 files; ไม่รวม SRS ฉบับเต็ม รายการ ADD ระบุครบใน UNIT-TEST-HANDOFF.md
ประวัติรอบ integration เดิมบันทึก git diff --stat ของ tracked changes: 4 files, 134 insertions, 32 deletions และเคยนับ 15 untracked additions รวม SRS ตัวเลขประวัตินี้ไม่ใช่รายการอัปโหลดจริง ซึ่ง GitHub Audit ยืนยันเป็น 14 ADD + 4 MERGE
สถานะ ณ รอบ integration เดิม: ไม่มี staged files; source/test hashes ยืนยันไม่ทับงาน Team; .env.example คงเดิมเพื่อไม่แก้ secret/history โดยพลการ ไม่ใช้ข้อความนี้อธิบายสถานะ Git ปัจจุบัน
candidate allowlist ไม่มี .env, node_modules, cache, coverage/test-results, staging/history ZIP หรือ credentials ที่ตรวจพบด้วย pattern scan (ไม่ใช่การรับรองว่าไม่มี secret ทุกชนิด)
dependency/evidence directories เก็บในเครื่อง ไม่ส่ง GitHub; historical CSV/metadata/reports ก่อนปรับเก็บเพิ่มที่ ../unit-merge-evidence-2026-11-04T08-40-38-575Z/before/
หลักฐานคำสั่ง/exit codes อยู่ command-runs.json, selector-migration.json และ final-verification.json ใน evidence directory เดียวกัน; ไม่ทับ historical evidence ของ Our

**Credential Finding แยกจาก BEAN Unit Testing — ผู้รับผิดชอบ: เจ้าของ Backend**

tracked backend/.env.example:3 มี credential-shaped database URL เดิมของทีมที่ไม่ใช่ placeholder และมีรูปแบบ Supabase; เหมือน base branch ไม่ใช่สิ่งที่ชุด Unit Testing เพิ่มหรือแก้ ไม่ได้ยืนยันว่า credential ใช้งานได้หรือถูก revoke แล้ว ไม่แสดงค่าและไม่เชื่อมต่อเพื่อทดสอบ
เจ้าของ Backend ต้องตรวจสอบสถานะ และ revoke/rotate หากเป็น credential จริง พร้อมจัดทำ sanitized example และประเมินประวัติ Git ภายใต้การอนุญาตแยกก่อนเปิด PR งานเอกสารนี้ไม่แก้ credential/config/history และไม่ถือว่าประเด็นนี้ได้รับการแก้ไขแล้ว
บันทึกประวัติเดิมยังคงสถานะ BLOCKED_SECURITY_REVIEW_BEFORE_PUBLICATION ใน manifest; ผลการรัน Unit Testing ผ่านไม่ได้ปิด Credential Finding นี้

รอบแก้เอกสารเปลี่ยนเฉพาะ UNIT-TEST-HANDOFF.md และ UNIT-TESTING-REPORT.md โดยคง Test Scripts, Production Code, Dependencies, Expected Results และ manifest เดิม ไม่รันทดสอบซ้ำ ไม่เชื่อม DB ไม่รัน HTTP/E2E/Integration และไม่ commit/push/เปิด PR ผู้ใช้จะอัปเดตเอกสารผ่าน GitHub Web ด้วยตนเอง
