import { z } from 'zod';

export type MultiTargetPlanItem = {
  projectId: string;
  prompt: string;
};

export type MultiTargetPlanResult = {
  items: MultiTargetPlanItem[];
  fallback: boolean;
  rationale: string;
};

const plannerResponseSchema = z.object({
  rationale: z.string().default(''),
  items: z
    .array(
      z.object({
        projectId: z.string().min(1),
        prompt: z.string().min(1),
      }),
    )
    .min(1),
});

/** Deterministic per-service prompts when the LLM planner is unavailable. */
export function fallbackMultiTargetPlan(
  task: string,
  projects: { id: string; name: string }[],
): MultiTargetPlanItem[] {
  const siblingList = projects.map((p) => p.id).join(', ');
  return projects.map((p) => ({
    projectId: p.id,
    prompt:
      `${task.trim()}\n\n` +
      `You own service \`${p.id}\` only. Do not modify other repos.\n` +
      `Sibling services in this feature (owned by other agents): ${siblingList}.\n` +
      `Implement only what belongs in \`${p.id}\`; respect likely contracts with siblings.`,
  }));
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Ask a planner (injectable) to split one feature spec into per-project prompts.
 * Always returns a usable plan — bad/partial answers fall back.
 */
export async function planMultiTarget(opts: {
  task: string;
  projects: { id: string; name: string }[];
  runPlanner: (system: string, user: string) => Promise<string>;
}): Promise<MultiTargetPlanResult> {
  const { task, projects, runPlanner } = opts;
  if (projects.length === 0) {
    return { items: [], fallback: true, rationale: 'no projects selected' };
  }

  const allowed = new Set(projects.map((p) => p.id));
  const catalog = projects.map((p) => `- ${p.id} (${p.name})`).join('\n');
  const system =
    'You are a planning assistant for a multi-repo coding cockpit. ' +
    'Respond with ONLY a JSON object: ' +
    '{"rationale":string,"items":[{"projectId":string,"prompt":string}]}. ' +
    'Rules: include exactly one item per selected projectId; ' +
    'each prompt must tell the agent what to implement in THAT repo only; ' +
    'mention sibling services when contracts matter; do not invent projectIds.';
  const user =
    `Feature / specification:\n\n${task.trim()}\n\n` +
    `Selected services (projectIds):\n${catalog}\n\n` +
    'Produce one scoped implementation prompt per service.';

  try {
    const raw = await runPlanner(system, user);
    const json = extractJsonObject(raw);
    const parsed = plannerResponseSchema.safeParse(json);
    if (!parsed.success) {
      return {
        items: fallbackMultiTargetPlan(task, projects),
        fallback: true,
        rationale: 'planner returned unparseable JSON — using fallback',
      };
    }

    const byId = new Map<string, string>();
    for (const item of parsed.data.items) {
      if (!allowed.has(item.projectId)) continue;
      byId.set(item.projectId, item.prompt.trim());
    }
    if (byId.size !== projects.length) {
      return {
        items: fallbackMultiTargetPlan(task, projects),
        fallback: true,
        rationale: 'planner omitted or invented projectIds — using fallback',
      };
    }

    return {
      items: projects.map((p) => ({
        projectId: p.id,
        prompt: byId.get(p.id)!,
      })),
      fallback: false,
      rationale: parsed.data.rationale || 'planned',
    };
  } catch {
    return {
      items: fallbackMultiTargetPlan(task, projects),
      fallback: true,
      rationale: 'planner unavailable — using fallback',
    };
  }
}
