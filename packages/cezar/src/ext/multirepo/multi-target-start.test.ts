import { describe, expect, it } from 'vitest';
import { startMultiTargetRuns } from './multi-target-start.ts';
import type { WorkflowDef } from '../../workflows/types.ts';

const workflow: WorkflowDef = {
  name: 'quick',
  source: 'built-in',
  steps: [{ id: 't', name: 't', prompt: '{{task}}' }],
};

describe('startMultiTargetRuns', () => {
  it('starts one run per target with shared groupId and variant=projectId', async () => {
    const started: Array<{ projectId: string; task: string; group: unknown }> = [];
    const persisted: Array<{ groupId: string; members: Array<{ projectId: string; runId: string }> }> =
      [];

    const managers = {
      'platform-core-service': {
        startRun: (_wf: unknown, input: { task: string }, group: { groupId: string; variant: string }) => {
          started.push({ projectId: 'platform-core-service', task: input.task, group });
          return {
            id: 'r1',
            title: 'BE work',
            groupId: group.groupId,
            variant: group.variant,
          };
        },
        store: {
          updateRun: (id: string, patch: { title?: string }) => ({
            id,
            title: patch.title ?? 'BE work',
          }),
        },
      },
      'platform-web-admin': {
        startRun: (_wf: unknown, input: { task: string }, group: { groupId: string; variant: string }) => {
          started.push({ projectId: 'platform-web-admin', task: input.task, group });
          return {
            id: 'r2',
            title: 'FE work',
            groupId: group.groupId,
            variant: group.variant,
          };
        },
        store: {
          updateRun: (id: string, patch: { title?: string }) => ({
            id,
            title: patch.title ?? 'FE work',
          }),
        },
      },
    };

    const result = await startMultiTargetRuns({
      workflow,
      inputBase: { autonomous: true },
      items: [
        { projectId: 'platform-core-service', prompt: 'BE work' },
        { projectId: 'platform-web-admin', prompt: 'FE work' },
      ],
      sourceRef: { kind: 'compose' },
      getManager: (id) => managers[id as keyof typeof managers] as never,
      persistGroup: (groupId, members) => {
        persisted.push({ groupId, members });
      },
    });

    expect(result.runs).toHaveLength(2);
    expect(started[0].group).toMatchObject({
      groupId: result.groupId,
      variant: 'platform-core-service',
    });
    expect(started[0].task).toBe('BE work');
    // No groupKind on the stock startRun group arg
    expect(started[0].group).not.toHaveProperty('groupKind');
    expect(persisted[0].members).toEqual([
      { projectId: 'platform-core-service', runId: 'r1' },
      { projectId: 'platform-web-admin', runId: 'r2' },
    ]);
  });

  it('stamps Jira key onto run titles when sourceRef has a key', async () => {
    const updates: string[] = [];
    const manager = {
      startRun: () => ({ id: 'r1', title: 'Implement feature', groupId: 'g', variant: 'core' }),
      store: {
        updateRun: (_id: string, patch: { title?: string }) => {
          if (patch.title) updates.push(patch.title);
          return { id: 'r1', title: patch.title ?? 'Implement feature' };
        },
      },
    };
    const result = await startMultiTargetRuns({
      workflow,
      items: [{ projectId: 'core', prompt: 'do it' }],
      sourceRef: { kind: 'jira', key: 'PLAT-9', url: 'https://example.atlassian.net/browse/PLAT-9' },
      getManager: () => manager as never,
      persistGroup: () => {},
    });
    expect(result.runs[0].title).toBe('PLAT-9: Implement feature');
    expect(updates).toEqual(['PLAT-9: Implement feature']);
  });
});
