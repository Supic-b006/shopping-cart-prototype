# BEAN Shopping Cart — Phase 2 Safe Integration

วันที่: 6 พฤศจิกายน 2026 (Asia/Bangkok)

**Verdict: READY_FOR_REVIEW — เฉพาะ local integration, static checks และ unit verification**

**Security: SECURITY_PENDING. DB/HTTP Integration และ Playwright E2E runtime: NOT_EXECUTED.**

## Project และ commit ที่ตรวจ

- Project: `D:\Work\Software Testing\BEAN-Combined-Testing`
- Local branch: `integration/combined-testing`
- Verified code HEAD: `557284542f6165de89e54bd84584a00eb1b491d2`
- รายงานนี้เพิ่มใน commit เอกสารภายหลัง verified code HEAD; ไม่มีการเปลี่ยน runtime/tests/dependencies หลังผลตรวจที่อ้างอิง
- Original repository ไม่ถูกแก้ไข; ไม่มี push, GitHub merge หรือ PR และไม่ได้เปลี่ยน branches ของสมาชิก
- Preflight: clone สะอาด, integration branch ยังไม่มี, พื้นที่ D ว่างประมาณ 3.8 TB; Node 24.14.0, npm 11.9.0, Git 2.47.1.windows.1
- Fetch สำเร็จและ SHA ของทั้ง 5 branches ตรงกับ Phase 1 ก่อนเริ่ม merge

| Branch | Remote SHA ที่ใช้ |
|---|---|
| main | `6d512032139781c14b5ce750e28a3e7f16d8e39a` |
| Unit-Test | `8c8ecd7cc0074168252d30f127cd5216243e503b` |
| test/bean-unit-srs-v1.8 | `352a4233b6f9d023f3736ad05c7d0d5d9dc63c90` |
| test/playwright-acceptance | `9916d653a58b13827e2a73ac9d3c7a69e1f2cb3a` |
| Integration-test | `2728dd0df28b4cc4d974829c3917014a38514dbc` |

## Merge history และ conflict resolution

สร้าง branch จาก main ที่ตรวจแล้ว และใช้ merge commits รักษาประวัติ/ผู้เขียนเดิม:

| ลำดับ | Branch | Local merge commit | ผลและวิธี resolve |
|---|---|---|---|
| 1 | test/playwright-acceptance | `734a8ccb1449053572e43df1ecc6ffb799bd6ec0` | Merge ได้โดยไม่มี conflict |
| 2 | Integration-test | `015ffa915e62828cce419a05ba6efef48cfebe7c` | package.json ชนที่ scripts; เก็บทั้ง db:migrate:e2e, db:seed:e2e และ test:integration |
| 3 | test/bean-unit-srs-v1.8 | `557284542f6165de89e54bd84584a00eb1b491d2` | package.json, backend/package.json, package-lock.json ชน; รวม scripts/dependency names ทุกชุด และ resolve graph ตาม manifests รวม |

ไม่ merge Unit-Test ซ้ำ เพราะเป็น ancestor ของ bean-unit อยู่แล้ว ตรวจยืนยัน HEAD ของ branches ทั้ง 5 เป็น ancestor ของ verified integration HEAD

การแก้เพิ่มเติมในขั้น resolve:

- Root/backend Vitest และ root @vitest/ui pin ที่ 5.1.0; backend @vitest/coverage-v8 คง 5.1.0
- คง dependency ชื่อ vite จาก Integration แต่ใช้ 7.3.7 ให้ตรง frontend และเข้ากับ React plugin เดิม
- backend/vitest.unit.config.ts เลิก import/read `base.test` จาก callback ของ Integration และระบุ environment=node, testTimeout=30000 โดยตรง ซึ่งเป็นค่าของ unit config เดิม
- Unit allowlist ยังเป็น domain.test.ts และ tests/unit/**/*.test.ts; coverage scope, reporters, output paths และ TODO เดิมทั้งหมดคงไว้ ไม่โหลด DB env ผ่าน unit config
- Base backend/vitest.config.ts คงของ Integration ทั้งไฟล์: include tests/**/*.test.ts, env loading, fileParallelism=false และ timeouts เดิม; test:unit:team ยังเลือก cartService.test.ts แยกเหมือนเดิม
- .gitignore รวมอัตโนมัติ และตรวจว่าคงทั้ง E2E env, coverage/cache/test artifact ignores
- TypeScript configs, Playwright config, runtime source และ assertions ไม่ถูกแก้เพื่อทำให้ tests ผ่าน
- CSV traceability เดิมใช้ CRLF; whitespace check ที่ใช้ cr-at-eol ผ่าน โดยไม่แก้ข้อมูล CSV ของสมาชิก

ไม่มีการใช้ hard reset, force push, squash/cherry-pick หรือรับ ours/theirs ทั้งไฟล์โดยไม่ตรวจเนื้อหา

## Dependency compatibility

| Package | เวอร์ชันที่ resolve |
|---|---|
| vitest | 5.1.0; มีเพียงเวอร์ชันเดียวใน lockfile |
| @vitest/ui | 5.1.0 |
| @vitest/coverage-v8 | 5.1.0 |
| vite | 7.3.7 |
| @playwright/test | 1.64.1 |
| TypeScript | 5.9.2 |

เหตุผลปรับ Vite: รอบแรกคง root Vite 8.3.5 ตาม Integration และ frontend Vite 7.3.7 แม้ npm ci สำเร็จ แต่ npm ls พบ ELSPROBLEMS เพราะ @vitejs/plugin-react 5.0.3 ที่ hoist ขึ้น root รองรับ Vite ถึง major 7 ขณะที่ Vitest 5.1.0 รองรับ Vite 6.4/7/8 จึงใช้ Vite 7.3.7 ร่วมกันโดยไม่เปลี่ยน plugin หรือพฤติกรรม tests

การสร้าง lockfile เริ่มจาก union ของ lock package paths ของ branches ที่ตรวจแล้ว แล้วใช้ npm install --package-lock-only --ignore-scripts --no-audit --no-fund ให้ resolver reconcile กับ manifests รวม ไม่เลือก lockfile ของฝ่ายใดทั้งชุด หลังปรับ Vite ตรวจ clean npm ci --ignore-scripts --no-audit --no-fund สำเร็จ ติดตั้ง 243 packages และ npm ls ของ toolchain exit 0

Lock resolution/npm ci ทำใน merge working tree ก่อนสร้าง verified code commit; manifests และ lockfile ที่ติดตั้งเป็นไฟล์เดียวกับที่ commit ที่ `557284542f6165de89e54bd84584a00eb1b491d2` โดย hash อยู่ใน final-audit.json การตรวจ tests/build/typecheck ด้านล่างทำหลัง commit นี้และ working tree สะอาด

Scripts เดิมของทุก branch และ dependency names ของ root/backend/frontend คงครบ ตรวจ dependencies/devDependencies ของ manifests ตรงกับ workspace entries ใน lockfile ทั้งสามชุด ไม่ใช้ legacy-peer-deps หรือ force เพื่อซ่อน incompatibility

## Safe verification

ทุกคำสั่งในตารางรันที่ project ข้างต้นบน code SHA `557284542f6165de89e54bd84584a00eb1b491d2` โดยอ่าน scripts/imports ก่อนรัน ลบ inherited DB-related environment ใน child process และกำหนด RUN_DB_TESTS=false, ALLOW_TEST_RESET=false, E2E_ALLOW_RESET=false ไม่สร้าง .env หรือเรียก database

| ชุด/คำสั่ง | Passed | Failed | TODO | Skipped | ผล |
|---|---:|---:|---:|---:|---|
| npm run test:unit | 340 | 0 | 5 | 0 | PASS ตาม baseline; รวม legacy domain 3 cases แล้ว |
| npm run test:unit:team | 556 | 0 | 0 | 0 | PASS |
| รวมกรณีไม่ซ้ำ | **896** | **0** | **5** | **0** | ตรง baseline ทั้ง 901 cases |
| npm run test:coverage | 340 | 0 | 5 | 0 | PASS; เป็นการรัน unit ชุดเดิม ไม่บวกเป็น cases ใหม่ |
| Traceability generator + --check | — | — | — | — | PASS 345 registry cases |
| npm run typecheck | — | — | — | — | PASS backend และ frontend |
| npm run typecheck:unit | — | — | — | — | PASS unit tests และ Vitest configs |
| Static typecheck HTTP/Integration tests | — | — | — | — | PASS; ไม่มี execution |
| Static typecheck root E2E tsconfig | — | — | — | — | PASS; ไม่มี execution |
| npm run build | — | — | — | — | PASS backend tsc และ frontend tsc/vite build |

คำสั่ง static เพิ่มเติม:

```text
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --esModuleInterop --skipLibCheck backend/tests/http.test.ts backend/tests/integration.test.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

Coverage เฉพาะ backend/src/domain/pricing.ts, shop.ts และ errors.ts: statements 98.96% (192/194), branches 97.01% (130/134), functions 100% (59/59), lines 100% (116/116) ไม่ใช่ coverage ทั้งระบบหรือ cartService

Traceability: 312 specification-confirmed, 28 api-contract-only, 5 pending clarification; CSV ที่สร้างใหม่ตรง baseline ทุกคอลัมน์ยกเว้น path ของ execution artifact ไม่มีการเปลี่ยน registry/oracle/expected assertions

คง TODO เดิมทั้ง 5: zero weight, wrong-stage/invalid-payload precedence, createdAt tie ordering และ inconsistent currentOrderId สำหรับ payFail/paySuccess

คำสั่ง Team ผ่าน root wrapper รอบแรกส่ง JSON CLI options ไม่ถึง Vitest เนื่องจาก npm forwarding แต่ tests ผ่าน 556 กรณี จึงเก็บ JSON เพิ่มด้วยคำสั่ง workspace โดยตรง:

```text
npm run test:unit:team -w backend -- --reporter=json --outputFile=test-results/phase2-team.json
```

ผลรอบเก็บ JSON คือ 556 passed, 0 failed, 0 TODO, 0 skipped ไม่บวกการรันซ้ำเป็น cases ใหม่ และไม่ได้แก้ scripts ของสมาชิก

## Tests ที่ไม่ได้รัน

| ชุด/การดำเนินการ | สถานะ | สาเหตุ |
|---|---|---|
| HTTP tests ที่ใช้ DB | NOT_EXECUTED | ยังไม่ได้อนุมัติ isolated test environment |
| PostgreSQL Integration tests | NOT_EXECUTED | มี reset ก่อนแต่ละ test และยังไม่ได้อนุญาต DB access/reset |
| Playwright E2E runtime | NOT_EXECUTED | ยังไม่ได้อนุมัติ environment และอาจ reset ข้อมูล |
| DB migration, seed, reset | NOT_EXECUTED | อยู่นอกขอบเขตที่อนุมัติ |

จำนวน cases ของชุดที่ไม่ได้รันไม่ได้รับรองจาก execution และไม่รวมในยอด 901 unit cases; static compatibility ไม่ใช่หลักฐานว่า DB/E2E tests ผ่าน

## Final preservation/security audit

- HEAD ของ main, Unit-Test, bean-unit, Playwright และ Integration เป็น ancestor ของ integration HEAD ครบ
- ไม่มี input tracked path หาย; ที่ code commit มี tracked files 68 ไฟล์ ก่อนเพิ่มรายงานนี้
- Test/helper files ทั้ง 19 ไฟล์ตรง blob ของ input branches ไม่มีการเปลี่ยน assertions, TODO หรือ business logic
- Runtime/frontend/schema 23 paths ตรงกับ Playwright ล่าสุด และ cartService source/test ตรงกับ Unit-Test และ bean-unit
- Source ที่เขียน/รวมใหม่มีเพียง .gitignore, package.json, backend/package.json, package-lock.json และ backend/vitest.unit.config.ts
- Local main ยังคง `6d512032139781c14b5ce750e28a3e7f16d8e39a`; ไม่มี local branch สมาชิกถูกแก้ไข
- npm cache/logs อยู่ใต้ .git/phase2-audit; node_modules, build outputs, coverage และ test results ถูก ignore ไม่เข้า Git
- ไม่พบ SRS ฉบับเต็มที่มีข้อมูลผู้สอนเป็น tracked file; ไม่มีการเพิ่มเอกสาร SRS หรือ expected oracle ใหม่
- Scan แบบ pattern/provenance ไม่พบ secret ที่ผู้รวมเขียนเพิ่ม แต่ integration รับ tracked credential-shaped URL ที่มีอยู่ใน backend/.env.example จาก Playwright อยู่แล้ว จึงยังเป็น **SECURITY_PENDING**
- README URL ที่ pattern scan พบเป็น placeholder; ไม่ใช่ credential finding เดียวกับ backend/.env.example
- ไม่แสดงค่า credential, ไม่เชื่อมต่อเพื่อตรวจว่ายังใช้งานได้, ไม่ rotate และไม่ rewrite history ต้องให้ผู้รับผิดชอบยืนยันการจัดการก่อนอนุญาตเผยแพร่
- Pattern scan ไม่ใช่การรับรองว่าไม่มี secret ทุกชนิด และ READY_FOR_REVIEW ไม่ใช่การอนุญาต push/PR

## Local evidence

หลักฐานเหล่านี้อยู่ภายใน fresh clone และไม่ถูก track:

- `.git/phase2-audit/final-audit.json`: SHA, ancestry, per-file blob provenance, manifests, dependency versions, counts, security findings ที่ปิดค่าไว้ และ checks
- `.git/phase2-audit/*.log` และ command JSON: exact command, cwd, SHA, exit code และเวลา
- `.git/phase2-audit/dependency-tree-final.json`: resolved toolchain ไม่มี npm dependency errors
- `.git/phase2-audit/traceability.csv`: registry 345 cases จากผลรันใหม่
- `backend/test-results/unit-runs/2026-11-05T17-01-46-266Z-29020/results.json`: Our suite
- `backend/test-results/phase2-team.json`: Team suite
- `backend/test-results/unit-runs/2026-11-05T17-02-15-125Z-25832/results.json`: coverage run
- `backend/coverage/unit-runs/2026-11-05T17-02-15-125Z-25832/`: coverage artifacts

ขั้นต่อไปต้องยืนยัน isolated test environment และการจัดการ SECURITY_PENDING แยกต่างหาก ก่อน DB/E2E execution หรือการเผยแพร่ใด ๆ
