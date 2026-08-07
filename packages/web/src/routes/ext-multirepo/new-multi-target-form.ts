/**
 * Pure helpers for the multirepo New-task form (ext UI).
 * Stock new-task.tsx is intentionally untouched.
 */

export type MultiTargetPlanItem = { projectId: string; prompt: string }

export type MultiTargetSubmitBody =
  | {
      mode: 'multi-target'
      task: string
      projectIds: string[]
      items?: MultiTargetPlanItem[]
      sourceRef?: { kind: 'compose' | 'jira' | 'github' | 'file'; key?: string; url?: string }
      autonomous?: boolean
    }
  | { mode: 'single'; task: string; projectId: string }

export function buildSubmitBody(input: {
  task: string
  selectedProjectIds: string[]
  items?: MultiTargetPlanItem[]
  sourceRef?: { kind: 'compose' | 'jira' | 'github' | 'file'; key?: string; url?: string }
  autonomous?: boolean
}): MultiTargetSubmitBody {
  const ids = [...new Set(input.selectedProjectIds.filter(Boolean))]
  if (ids.length >= 2) {
    return {
      mode: 'multi-target',
      task: input.task,
      projectIds: ids,
      ...(input.items ? { items: input.items } : {}),
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
      ...(input.autonomous !== undefined ? { autonomous: input.autonomous } : {}),
    }
  }
  return {
    mode: 'single',
    task: input.task,
    projectId: ids[0] ?? '',
  }
}

export function toggleProjectId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
}
