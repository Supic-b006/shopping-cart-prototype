BEAN Unit Testing — Team Branch Handoff
วันที่ 4 พฤศจิกายน 2026

ผล GitHub Audit ล่าสุด: unit tests, coverage, TypeScript และ traceability ผ่านจาก Fresh Clone ของ branch test/bean-unit-srs-v1.8 ที่ commit 845b72b7a2a7ae396888916f54c005f46a448af7
Base: Unit-Test @ 8c8ecd7cc0074168252d30f127cd5216243e503b; actual delivery 14 ADD + 4 MERGE ตาม manifest
ผล audit ก่อนปรับเอกสารคือ CHANGES_REQUIRED; รอบนี้แก้รายการส่งมอบและช่องทางอ้างอิง SRS แล้ว แต่ยังไม่ประกาศ READY_FOR_PR จนเจ้าของ Backend ตรวจสอบ Credential Finding ที่แยกไว้ท้ายเอกสาร

ประวัติรอบ integration เดิม: งานรวมเสร็จใน local branch test/bean-unit-srs-v1.8 โดยไม่ stage/commit/push/เปิด PR ในรอบนั้น และบันทึกสถานะ BLOCKED_SECURITY_REVIEW_BEFORE_PUBLICATION ไว้ใน manifest ต่อมาผู้ใช้อัปโหลดผ่าน GitHub Web และมีการตรวจ Fresh Clone ตาม commit ข้างต้น

ผลจริง: Our 340 passed / 5 TODO, Team cartService 556 passed, Team legacy domain 3 passed; ไม่มี failed/skipped
Our รวม legacy 3 แล้ว: ยอดไม่ซ้ำ 896 passed / 5 TODO = 901 cases
Vitest + coverage-v8 5.1.0: statements 98.96%, branches 97.01%, functions/lines 100% เฉพาะ pricing.ts/shop.ts/errors.ts
root typecheck และ typecheck:unit ผ่าน รายละเอียด oracle, TODO, evidence และข้อจำกัดอยู่ UNIT-TESTING-REPORT.md

ใช้รายการ github_add (14) และ github_merge (4) ใน UNIT-TEST-HANDOFF-MANIFEST.json เป็นรายการส่งมอบปัจจุบัน รวม 18 ไฟล์
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

SRS v1.8 เป็นเอกสารอ้างอิงสำหรับการออกแบบ Tests และจะจัดหาให้ผู้ตรวจผ่านช่องทางที่ได้รับอนุญาต โดยผู้ส่งมอบเป็นผู้ประสานการเข้าถึง เอกสาร SRS-CART-002_v1.8_pubs.md ฉบับเต็มมีหมายเหตุสำหรับผู้สอน จึงไม่รวมในรายการส่งมอบและห้ามอัปโหลดฉบับเต็มนี้ตาม handoff
ชื่อไฟล์, SHA256 และเลขบรรทัดใน metadata/report ใช้ระบุฉบับที่ออกแบบ Tests ไม่ได้หมายความว่าไฟล์นั้นอยู่ใน GitHub checkout หากจัดหาฉบับเผยแพร่ที่ตัดหมายเหตุแล้ว ต้องระบุความสัมพันธ์กับฉบับอ้างอิงและเลขบรรทัดให้ผู้ตรวจเข้าใจ
ประวัติรายการเดิมเคยนับ 15 ADD โดยรวม SRS ฉบับเต็ม; ผล audit ยืนยัน actual delivery เป็น 14 ADD + 4 MERGE และแก้คำแนะนำปัจจุบันให้ตรง manifest แล้ว

คำสั่ง PowerShell จากรอบ integration เดิม (เก็บเป็นประวัติ; paths และ result JSON ด้านล่างเป็นหลักฐาน local ของรอบนั้น):
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

เมื่อย้ายเครื่อง ให้ติดตั้งตาม lockfile ด้วย npm ci --ignore-scripts --no-audit --no-fund แล้วรันคำสั่ง unit/typecheck ใน checkout นั้น โดยเลือก result JSON ของรอบใหม่สำหรับ traceability
ประวัติรอบ integration เดิมใช้ npm install --ignore-scripts และยังไม่ได้ execute clean npm ci; ข้อจำกัดนี้ใน manifest อธิบายรอบเดิม ผล GitHub Audit ล่าสุดใช้ Fresh Clone และ npm ci --ignore-scripts --no-audit --no-fund สำเร็จแล้ว พร้อม dependency/lockfile checks ผ่าน
ทั้งรอบ integration และ GitHub Audit ไม่มี DB/server/HTTP/E2E/Playwright และไม่ต้อง DATABASE_URL
JSON artifacts มี absolute paths จึงต้องรันใหม่ใน checkout ปลายทาง; config ออก run directory ใหม่อัตโนมัติ
สำหรับ traceability ของ run ใหม่ เลือก RUN-ID จริงและ output ใหม่ที่ยังไม่มี:
```powershell
node .unit-testing/generate-traceability.cjs --results backend/test-results/unit-runs/RUN-ID/results.json --out .unit-testing/results/local-cases.csv
node .unit-testing/generate-traceability.cjs --results backend/test-results/unit-runs/RUN-ID/results.json --out .unit-testing/results/local-cases.csv --check
```

345 registry IDs เดิมคงอยู่; 134 selectors ปรับตาม Vitest5 พร้อม history; 312 SRS-confirmed / 28 API-only / 5 pending
ไม่รวม Team556 ใน CSV นี้และไม่นับ assertions/loops เป็น cases เพิ่ม

Credential Finding — ผู้รับผิดชอบ: เจ้าของ Backend
tracked backend/.env.example:3 มี credential-shaped URL เดิมของทีม ซึ่งไม่ใช่ส่วนที่ BEAN Unit Testing เพิ่มหรือแก้ ยังไม่ได้ยืนยันว่าใช้งานได้หรือถูก revoke แล้ว ต้องให้เจ้าของ Backend ตรวจสอบสถานะ และ revoke/rotate หากเป็น credential จริง พร้อมจัดทำ sanitized example ภายใต้การอนุญาตที่เหมาะสมก่อนเปิด PR
ไม่แสดงค่า Credential ไม่ทดลองเชื่อมต่อ และไม่แก้ไฟล์ดังกล่าวหรือ Git history ในงานเอกสารนี้

การแก้ไขรอบนี้เปลี่ยนเฉพาะ UNIT-TEST-HANDOFF.md และ UNIT-TESTING-REPORT.md; ผู้ใช้จะนำไปอัปเดตบน GitHub Web ด้วยตนเอง ไม่มี commit/push/เปิด PR และไม่ได้รันทดสอบซ้ำในรอบแก้เอกสาร
