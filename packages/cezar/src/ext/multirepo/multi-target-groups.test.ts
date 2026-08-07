import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findMultiTargetGroup } from './multi-target-groups.ts';
import { saveMultirepoState, _setMultirepoHomeForTests } from './state.ts';

describe('findMultiTargetGroup', () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'cez-multirepo-'));
    _setMultirepoHomeForTests(home);
  });
  afterEach(async () => {
    _setMultirepoHomeForTests(undefined);
    await rm(home, { recursive: true, force: true });
  });

  it('returns null for unknown group', async () => {
    expect(await findMultiTargetGroup('missing')).toBeNull();
  });

  it('loads group from ext state without requiring RunRecord groupKind', async () => {
    await saveMultirepoState({
      groups: {
        g1: {
          kind: 'multi-target',
          createdAt: '2026-08-06T00:00:00.000Z',
          sourceRef: { kind: 'compose' },
          members: [
            { projectId: 'platform-core-service', runId: 'r1' },
            { projectId: 'platform-web-admin', runId: 'r2' },
          ],
        },
      },
    });
    const view = await findMultiTargetGroup('g1', {
      getRun: (projectId, runId) =>
        ({ id: runId, title: projectId, status: 'queued' }) as never,
    });
    expect(view?.groupKind).toBe('multi-target');
    expect(view?.members).toHaveLength(2);
    expect(view?.members[0].run?.title).toBe('platform-core-service');
  });
});
