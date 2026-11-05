import { describe, expect, it } from 'vitest';
const enabled = Boolean(process.env.DATABASE_URL && process.env.RUN_DB_TESTS === 'true');
const suite = enabled ? describe : describe.skip;

suite('Supabase-backed HTTP contract', () => {
  it('exposes health and login after migration/seed', async () => {
    const { createApp } = await import('../src/app.js');
    const { closePool } = await import('../src/db/pool.js');
    const server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      const health = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(health.status).toBe(200);
      const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'cus_normal',password:process.env.SEED_PASSWORD})});
      expect(login.status).toBe(200);
      expect((await login.json()).data.token).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      try { await new Promise<void>(resolve => server.close(() => resolve())); }
      finally { await closePool(); }
    }
  });
});
