/**
 * Pure helpers for the multirepo group view — keep all PRs, never pick-one.
 */

export type MultiTargetGroupMember = {
  projectId: string
  runId: string
  run?: { title?: string; status?: string }
}

export type MultiTargetGroupData = {
  groupId: string
  groupKind?: string
  createdAt?: string
  sourceRef?: { kind: string; key?: string; url?: string }
  members: MultiTargetGroupMember[]
}

/** True when the UI must not offer a pick-one / compare-winner control. */
export function isKeepAllGroup(data: MultiTargetGroupData): boolean {
  return data.groupKind === 'multi-target' || data.members.length >= 2
}

export function memberLabel(m: MultiTargetGroupMember): string {
  const title = m.run?.title?.trim()
  return title && title.length > 0 ? title : m.runId
}

export function memberStatus(m: MultiTargetGroupMember): string | undefined {
  return m.run?.status
}
