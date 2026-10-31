import { readFile } from 'node:fs/promises';
import { pool } from './pool.js';
import { transaction } from './repository.js';
import { seed } from './seed.js';
try {
 const command = process.argv[2];
 if (command === 'migrate') await pool.query(await readFile(new URL('../../../database/001_schema.sql',import.meta.url),'utf8'));
 else if (command === 'seed') await transaction(db => seed(db));
 else throw new Error('Expected migrate or seed');
 console.log(`${command} completed`);
} finally { await pool.end(); }
