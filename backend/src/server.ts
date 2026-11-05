import { createApp } from './app.js';
import { pool } from './db/pool.js';
const port = Number(process.env.PORT ?? 4000);
await pool.query('SELECT 1');
const app = createApp();
const onListen = () => console.log(`API listening on http://localhost:${port}`);
const server = process.env.NODE_ENV === 'test'
  ? app.listen(port, '127.0.0.1', onListen)
  : app.listen(port, onListen);
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => {
 server.close(() => {void pool.end().then(() => process.exit(0));});
});
