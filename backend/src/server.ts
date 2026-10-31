import { createApp } from './app.js';
import { pool } from './db/pool.js';
const port = Number(process.env.PORT ?? 4000);
await pool.query('SELECT 1');
const server = createApp().listen(port,() => console.log(`API listening on http://localhost:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => {
 server.close(() => {void pool.end().then(() => process.exit(0));});
});
