import type { RunRecord } from '../../runs/store.ts';
import { loadMultirepoState, type MultirepoGroup, type MultirepoSourceRef } from './state.ts';

export type MultiTargetGroupMemberView = {
  projectId: string;
  runId: string;
  run?: RunRecord;
};

export type MultiTargetGroupView = {
  groupId: string;
  groupKind: 'multi-target';
  sourceRef?: MultirepoSourceRef;
  createdAt: string;
  members: MultiTargetGroupMemberView[];
};

/**
 * Resolve a multi-target group from ext state, optionally enriching with live runs.
 */
export async function findMultiTargetGroup(
  groupId: string,
  opts?: {
    getRun?: (projectId: string, runId: string) => RunRecord | undefined;
  },
): Promise<MultiTargetGroupView | null> {
  const state = await loadMultirepoState();
  const group: MultirepoGroup | undefined = state.groups[groupId];
  if (!group || group.kind !== 'multi-target') return null;

  return {
    groupId,
    groupKind: 'multi-target',
    sourceRef: group.sourceRef,
    createdAt: group.createdAt,
    members: group.members.map((m) => ({
      projectId: m.projectId,
      runId: m.runId,
      run: opts?.getRun?.(m.projectId, m.runId),
    })),
  };
}
