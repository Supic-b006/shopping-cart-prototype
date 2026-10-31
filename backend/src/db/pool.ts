import pg from 'pg';
import { readFileSync } from 'node:fs';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in backend/.env first');
export const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,
  ssl:process.env.DATABASE_SSL === 'false' ? false : {
    rejectUnauthorized: false,
    ...(process.env.DATABASE_CA_FILE ? {ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')} : {})
  }, max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});
pool.on('error', error => console.error('Database pool:',error.message));
