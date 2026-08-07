import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  registerMultirepoExt,
  _setMultirepoHomeForTests,
} from './index.ts';

describe('registerMultirepoExt', () => {
  it('mounts /ext/multirepo/health', async () => {
    const app = new Hono();
    registerMultirepoExt({ app });
    const res = await app.request('/ext/multirepo/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ext: 'multirepo' });
  });

  it('gets and puts board config in ext state', async () => {
    const home = mkdtempSync(join(tmpdir(), 'multirepo-board-'));
    _setMultirepoHomeForTests(home);
    try {
      const app = new Hono();
      registerMultirepoExt({ app });

      const empty = await app.request('/ext/multirepo/board');
      expect(empty.status).toBe(200);
      expect(await empty.json()).toEqual({ configured: false, board: null });

      const put = await app.request('/ext/multirepo/board', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'jira',
          baseUrl: 'https://acme.atlassian.net/',
          email: 'dev@acme.test',
          apiTokenEnv: 'JIRA_API_TOKEN',
          jql: 'project = PLAT',
        }),
      });
      expect(put.status).toBe(200);
      const saved = (await put.json()) as { configured: boolean; board: { baseUrl: string } };
      expect(saved.configured).toBe(true);
      expect(saved.board.baseUrl).toBe('https://acme.atlassian.net');

      const got = await app.request('/ext/multirepo/board');
      expect((await got.json() as { configured: boolean }).configured).toBe(true);

      const issues = await app.request('/ext/multirepo/board/issues');
      const listed = (await issues.json()) as { available: boolean; reason?: string };
      expect(listed.available).toBe(false);
      expect(listed.reason).toMatch(/missing env/);
    } finally {
      _setMultirepoHomeForTests(undefined);
      rmSync(home, { recursive: true, force: true });
    }
  });
});
