import { randomUUID } from 'node:crypto';
import type { RunRecord } from '../../runs/store.ts';
import type { StartRunInput } from '../../workflows/run.ts';
import type { WorkflowDef } from '../../workflows/types.ts';
import { withJiraIssueKey } from './pr-issue-key.ts';
import type { MultirepoSourceRef } from './state.ts';
import { loadMultirepoState, saveMultirepoState } from './state.ts';

export type MultiTargetStartItem = {
  projectId: string;
  prompt: string;
};

export type MultiTargetStartManager = {
  startRun: (
    workflow: WorkflowDef,
    input: StartRunInput,
    group?: { groupId: string; variant: string },
  ) => RunRecord;
  store: {
    updateRun: (id: string, patch: Partial<Pick<RunRecord, 'title'>>) => RunRecord | undefined;
  };
};

export type MultiTargetStartResult = {
  groupId: string;
  runs: Array<RunRecord & { projectId: string }>;
  errors: Array<{ projectId: string; error: string }>;
};

/**
 * Fan-out one planned feature across N project RunManagers.
 * Uses stock groupId + variant(=projectId); group metadata lives in ext state.
 */
export async function startMultiTargetRuns(opts: {
  workflow: WorkflowDef;
  inputBase?: Omit<StartRunInput, 'task'>;
  items: MultiTargetStartItem[];
  sourceRef?: MultirepoSourceRef;
  getManager: (
    projectId: string,
  ) => MultiTargetStartManager | undefined | Promise<MultiTargetStartManager | undefined>;
  /** Optional overrides for tests — default uses load/saveMultirepoState. */
  persistGroup?: (
    groupId: string,
    members: Array<{ projectId: string; runId: string }>,
  ) => void | Promise<void>;
}): Promise<MultiTargetStartResult> {
  const groupId = randomUUID();
  const runs: Array<RunRecord & { projectId: string }> = [];
  const errors: Array<{ projectId: string; error: string }> = [];
  const key = opts.sourceRef?.kind === 'jira' ? opts.sourceRef.key : undefined;

  for (const item of opts.items) {
    const manager = await opts.getManager(item.projectId);
    if (!manager) {
      errors.push({
        projectId: item.projectId,
        error: `unknown or unavailable project: ${item.projectId}`,
      });
      continue;
    }
    try {
      const run = manager.startRun(
        opts.workflow,
        { ...opts.inputBase, task: item.prompt },
        { groupId, variant: item.projectId },
      );
      if (key) {
        const stamped = withJiraIssueKey(run.title, key);
        if (stamped !== run.title) {
          manager.store.updateRun(run.id, { title: stamped });
          run.title = stamped;
        }
      }
      runs.push(Object.assign(run, { projectId: item.projectId }));
    } catch (err) {
      errors.push({
        projectId: item.projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (runs.length === 0) {
    throw new Error(
      errors.length
        ? `multi-target start failed: ${errors.map((e) => `${e.projectId}: ${e.error}`).join('; ')}`
        : 'multi-target start failed: no valid targets',
    );
  }

  const members = runs.map((r) => ({ projectId: r.projectId, runId: r.id }));
  const persist =
    opts.persistGroup ??
    (async (gid, mems) => {
      const state = await loadMultirepoState();
      state.groups[gid] = {
        kind: 'multi-target',
        createdAt: new Date().toISOString(),
        sourceRef: opts.sourceRef,
        members: mems,
      };
      await saveMultirepoState(state);
    });
  await persist(groupId, members);

  return { groupId, runs, errors };
}
