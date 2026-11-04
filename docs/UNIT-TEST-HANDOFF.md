BEAN Unit Testing — Team Branch Handoff
วันที่ 4 พฤศจิกายน 2026

สถานะ **BLOCKED** เนื่องจาก credential-shaped URL เดิมใน tracked backend/.env.example:3 ต้องให้เจ้าของตรวจสอบก่อนเผยแพร่
งาน unit integration เสร็จใน branch test/bean-unit-srs-v1.8 จาก Unit-Test @ 8c8ecd7cc0074168252d30f127cd5216243e503b ไม่ stage/commit/push/เปิด PR

ผลจริง: Our 340 passed / 5 TODO, Team cartService 556 passed, Team legacy domain 3 passed; ไม่มี failed/skipped
Our รวม legacy 3 แล้ว: ยอดไม่ซ้ำ 896 passed / 5 TODO = 901 cases
Vitest + coverage-v8 5.1.0: statements 98.96%, branches 97.01%, functions/lines 100% เฉพาะ pricing.ts/shop.ts/errors.ts
root typecheck และ typecheck:unit ผ่าน รายละเอียด oracle, TODO, evidence และข้อจำกัดอยู่ UNIT-TESTING-REPORT.md

ใช้รายการ github_add (15) และ github_merge (4) ใน UNIT-TEST-HANDOFF-MANIFEST.json เป็น candidate allowlist
ไฟล์ ADD:
```text
backend/tests/unit/errors.test.ts
backend/tests/unit/helpers.ts
backend/tests/unit/pricing.test.ts
backend/tests/unit/shop.test.ts
backend/tests/unit/srs-v18.test.ts
backend/tests/unit/high-value.test.ts
backend/tsconfig.unit.json
backend/vitest.unit.config.ts
SRS-CART-002_v1.8_pubs.md
.unit-testing/generate-traceability.cjs
docs/UNIT-TEST-METADATA.json
docs/UNIT-TEST-CASES-high-value.csv
docs/UNIT-TESTING-REPORT.md
docs/UNIT-TEST-HANDOFF.md
docs/UNIT-TEST-HANDOFF-MANIFEST.json
```

MERGE ที่ทำแล้ว: package.json, backend/package.json, package-lock.json, .gitignore
คง scripts/dependencies/tests เดิมของ Team; lockfile resolve เพิ่ม coverage5.1.0 ไม่ copy ของ Our
KEEP: production/backend/frontend/schema, cartService.test.ts, domain.test.ts, http.test.ts, base Vitest/TS configs และ E2E
EXCLUDE: .env/credentials, node_modules, npm cache, coverage/test-results, dist, Playwright artifacts, staging/history/evidence ZIP
.unit-testing ส่งเพียง generate-traceability.cjs ไม่ส่งทั้ง directory

คำสั่ง PowerShell (dependencies ติดตั้งแล้ว):
```powershell
Set-Location -LiteralPath 'D:\Work\Software Testing\shopping-cart-prototype-main\shopping-cart-prototype'
npm run test:unit
npm run test:unit:team
npm run test:domain
npm run test:coverage
npm run typecheck
npm run typecheck:unit
node .unit-testing/generate-traceability.cjs --results backend/test-results/unit-runs/2026-11-04T08-50-28-075Z-25288/results.json --out docs/UNIT-TEST-CASES-high-value.csv --check
```

อย่าใช้ npm test สำหรับ unit-only verification เพราะรักษาคำสั่งเดิมของ Team ที่อาจเลือก HTTP tests
ถ้าต้องการส่ง reporter flags ให้ใช้ workspace โดยตรง:
```powershell
npm run test:unit:team -w backend -- --reporter=default --reporter=json --outputFile=test-results/team-local/cartService.json
npm run test:domain -w backend -- --reporter=default --reporter=json --outputFile=test-results/team-local/domain.json
```
เปลี่ยนชื่อ output directory ที่ยังไม่มีเพื่อรักษาหลักฐานเดิม

เมื่อย้ายเครื่อง ให้ติดตั้งตาม lockfile ด้วย npm ci --ignore-scripts --no-audit --no-fund แล้วรันคำสั่งข้างต้น (npm ci เป็นคำแนะนำสำหรับ checkout ใหม่ ไม่ได้ execute ในรอบนี้)
รอบนี้ใช้ npm install --ignore-scripts; ไม่มี DB/server/HTTP/E2E/Playwright และไม่ต้อง DATABASE_URL
JSON artifacts มี absolute paths จึงต้องรันใหม่ใน checkout ปลายทาง; config ออก run directory ใหม่อัตโนมัติ
สำหรับ traceability ของ run ใหม่ เลือก RUN-ID จริงและ output ใหม่ที่ยังไม่มี:
```powershell
node .unit-testing/generate-traceability.cjs --results backend/test-results/unit-runs/RUN-ID/results.json --out .unit-testing/results/local-cases.csv
node .unit-testing/generate-traceability.cjs --results backend/test-results/unit-runs/RUN-ID/results.json --out .unit-testing/results/local-cases.csv --check
```

345 registry IDs เดิมคงอยู่; 134 selectors ปรับตาม Vitest5 พร้อม history; 312 SRS-confirmed / 28 API-only / 5 pending
ไม่รวม Team556 ใน CSV นี้และไม่นับ assertions/loops เป็น cases เพิ่ม
ก่อนส่งต่อให้เจ้าของจัดการ security blocker และขออนุญาต commit/push/PR ในขั้นตอนถัดไป
