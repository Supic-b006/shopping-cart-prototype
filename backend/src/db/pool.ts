import pg from "pg";
import { readFileSync } from "node:fs";

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

export const pool = new pg.Pool({
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
});

// ป้องกัน idle connection error ทำให้ Node.js ปิดตัว
pool.on("error", (error) => {
  console.error(
    "Unexpected PostgreSQL pool error:",
    error.message,
  );
});