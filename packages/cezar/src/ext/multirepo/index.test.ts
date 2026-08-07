import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerMultirepoExt } from './index.ts';

describe('registerMultirepoExt', () => {
  it('mounts /ext/multirepo/health', async () => {
    const app = new Hono();
    registerMultirepoExt({ app });
    const res = await app.request('/ext/multirepo/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ext: 'multirepo' });
  });
});
