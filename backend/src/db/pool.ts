import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createPgConfig } from "@electric-sql/pglite/node-postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL in backend/.env first");
}

const ssl =
  process.env.DATABASE_SSL === "false"
    ? false
    : {
        // ใช้ false เพื่อรองรับ Supabase Pooler และกรณี certificate chain
        rejectUnauthorized: false,

        ...(process.env.DATABASE_CA_FILE
          ? {
              ca: readFileSync(
                process.env.DATABASE_CA_FILE,
                "utf8",
              ),
            }
          : {}),
      };

const isLocalPglite = process.env.PGLITE_TEST_DB === "true";
const localDataDir = process.env.PGLITE_DATA_DIR ??
  fileURLToPath(new URL("../../../.pglite-integration", import.meta.url));
const localDatabase = isLocalPglite ? new PGlite(localDataDir) : undefined;

const poolConfig = isLocalPglite
  ? { ...createPgConfig(localDatabase!), max: 1 } as unknown as pg.PoolConfig
  : {
  connectionString: process.env.DATABASE_URL,
  ssl,

  // จำกัดจำนวน connection เพื่อไม่ใช้ connection ของ Supabase มากเกินไป
  max: 5,

  // รอเชื่อมต่อฐานข้อมูลได้ไม่เกิน 15 วินาที
  connectionTimeoutMillis: 15_000,

  // ปิด idle connection เพื่อให้ Pool สร้าง connection ใหม่แทนตัวที่อาจหมดอายุ
  idleTimeoutMillis: 10_000,

  // ตรวจจับ connection ที่ขาดระหว่างเปิดใช้งาน
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  };

export const pool = new pg.Pool(poolConfig);

export async function closePool(): Promise<void> {
  try {
    await pool.end();
  } finally {
    await localDatabase?.close();
  }
}

// ป้องกัน idle connection error ทำให้ Node.js ปิดตัว
pool.on("error", (error) => {
  console.error(
    "Unexpected PostgreSQL pool error:",
    error.message,
  );
});
