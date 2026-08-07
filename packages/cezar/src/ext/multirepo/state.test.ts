import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadMultirepoState,
  saveMultirepoState,
  _setMultirepoHomeForTests,
} from './state.ts';

describe('multirepo ext state', () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'cez-multirepo-'));
    _setMultirepoHomeForTests(home);
  });
  afterEach(async () => {
    _setMultirepoHomeForTests(undefined);
    await rm(home, { recursive: true, force: true });
  });

  it('round-trips a group and board', async () => {
    await saveMultirepoState({
      board: {
        kind: 'jira',
        baseUrl: 'https://example.atlassian.net',
        email: 'a@b.c',
        apiTokenEnv: 'JIRA_API_TOKEN',
        jql: 'assignee = currentUser()',
      },
      groups: {
        g1: {
          kind: 'multi-target',
          createdAt: '2026-08-06T00:00:00.000Z',
          sourceRef: { kind: 'compose' },
          members: [{ projectId: 'platform-core-service', runId: 'r1' }],
        },
      },
    });
    const loaded = await loadMultirepoState();
    expect(loaded.groups.g1.members[0].runId).toBe('r1');
    expect(loaded.board?.kind).toBe('jira');
  });

  it('degrades to empty state when file missing', async () => {
    const loaded = await loadMultirepoState();
    expect(loaded.groups).toEqual({});
  });
});
