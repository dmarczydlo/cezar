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

/** Optional om-spec-writing refine hint prepended before plan/start. */
export const OM_SPEC_REFINE_HINT = [
  'Before implementing, refine this into a clear implementation spec in the style of the om-spec-writing skill:',
  '- goal, non-goals, acceptance criteria, and out-of-scope',
  '- concrete file/package touch points per target service when known',
  '- risks and open questions',
  '',
  'Specification:',
  '',
].join('\n')

export function withOmSpecRefineHint(task: string, enabled: boolean): string {
  const trimmed = task.trim()
  if (!enabled || !trimmed) return task
  if (task.includes('om-spec-writing')) return task
  return `${OM_SPEC_REFINE_HINT}${task}`
}
