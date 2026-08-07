import { Hono } from 'hono';
import { z } from 'zod';
import type { WorkflowDef } from '../../workflows/types.ts';
import { findMultiTargetGroup } from './multi-target-groups.ts';
import { planMultiTarget } from './multi-target-plan.ts';
import {
  startMultiTargetRuns,
  type MultiTargetStartManager,
} from './multi-target-start.ts';
import { listJiraIssues } from './board/jira.ts';
import {
  loadMultirepoState,
  saveMultirepoState,
  type MultirepoBoardConfig,
  type MultirepoSourceRef,
} from './state.ts';

/**
 * Multirepo extension registration seam.
 * Keep upstream touch points to a single call from `createApp` / server bootstrap.
 */

const PROJECT_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const sourceRefSchema = z
  .object({
    kind: z.enum(['jira', 'github', 'file', 'compose']),
    key: z.string().max(64).optional(),
    url: z.string().max(2048).optional(),
  })
  .optional();

const boardBodySchema = z.object({
  kind: z.literal('jira'),
  baseUrl: z.string().url().max(2048),
  email: z.string().email().max(320),
  apiTokenEnv: z.string().min(1).max(200),
  jql: z.string().min(1).max(4000),
});

const planBodySchema = z.object({
  task: z.string().min(1).max(100_000),
  projectIds: z.array(z.string().regex(PROJECT_ID_RE)).min(2).max(8),
});

const startBodySchema = z.object({
  task: z.string().min(1).max(100_000),
  projectIds: z.array(z.string().regex(PROJECT_ID_RE)).min(2).max(8),
  items: z
    .array(
      z.object({
        projectId: z.string().regex(PROJECT_ID_RE),
        prompt: z.string().min(1).max(100_000),
      }),
    )
    .min(2)
    .max(8)
    .optional(),
  autonomous: z.boolean().optional(),
  runner: z.enum(['claude', 'codex', 'opencode', 'cursor']).optional(),
  model: z.string().max(200).optional(),
  sourceRef: sourceRefSchema,
});

const DEFAULT_WORKFLOW: WorkflowDef = {
  name: '(planned)',
  source: 'built-in',
  steps: [{ id: 'task', name: 'Do the task', prompt: '{{task}}' }],
};

export type MultirepoExtDeps = {
  /** Workspace-level Hono app already mounted under `/api/v1`. */
  app: Hono;
  getManager?: (
    projectId: string,
  ) => MultiTargetStartManager | undefined | Promise<MultiTargetStartManager | undefined>;
  resolveProjects?: (
    projectIds: string[],
  ) => Array<{ id: string; name: string }> | Promise<Array<{ id: string; name: string }>>;
  runPlanner?: (system: string, user: string) => Promise<string>;
  defaultWorkflow?: WorkflowDef;
};

function buildRoutes(deps: MultirepoExtDeps): Hono {
  const routes = new Hono();

  routes.get('/ext/multirepo/health', (c) => c.json({ ok: true, ext: 'multirepo' }));

  routes.get('/ext/multirepo/board', async (c) => {
    const state = await loadMultirepoState();
    if (!state.board) {
      return c.json({ configured: false as const, board: null });
    }
    return c.json({ configured: true as const, board: state.board });
  });

  routes.put('/ext/multirepo/board', async (c) => {
    let body: z.infer<typeof boardBodySchema>;
    try {
      body = boardBodySchema.parse(await c.req.json());
    } catch {
      return c.json({ error: 'invalid body' }, 400);
    }
    const state = await loadMultirepoState();
    const board: MultirepoBoardConfig = {
      kind: 'jira',
      baseUrl: body.baseUrl.replace(/\/+$/, ''),
      email: body.email,
      apiTokenEnv: body.apiTokenEnv,
      jql: body.jql,
    };
    state.board = board;
    await saveMultirepoState(state);
    return c.json({ configured: true as const, board });
  });

  routes.delete('/ext/multirepo/board', async (c) => {
    const state = await loadMultirepoState();
    delete state.board;
    await saveMultirepoState(state);
    return c.json({ configured: false as const, board: null });
  });

  routes.get('/ext/multirepo/board/issues', async (c) => {
    const state = await loadMultirepoState();
    if (!state.board) {
      return c.json({
        available: false,
        reason: 'board not configured',
        issues: [],
      });
    }
    const result = await listJiraIssues(state.board);
    return c.json(result);
  });

  routes.post('/ext/multirepo/multi-target/plan', async (c) => {
    let body: z.infer<typeof planBodySchema>;
    try {
      body = planBodySchema.parse(await c.req.json());
    } catch {
      return c.json({ error: 'invalid body' }, 400);
    }
    const projects = deps.resolveProjects
      ? await deps.resolveProjects(body.projectIds)
      : body.projectIds.map((id) => ({ id, name: id }));
    if (projects.length < 2) {
      return c.json({ error: 'need at least two resolvable projects' }, 400);
    }
    const runPlanner =
      deps.runPlanner ??
      (async () => {
        throw new Error('planner unavailable');
      });
    const result = await planMultiTarget({
      task: body.task,
      projects,
      runPlanner,
    });
    return c.json(result);
  });

  routes.post('/ext/multirepo/multi-target/runs', async (c) => {
    if (!deps.getManager) {
      return c.json({ error: 'multi-target start is not wired' }, 503);
    }
    let body: z.infer<typeof startBodySchema>;
    try {
      body = startBodySchema.parse(await c.req.json());
    } catch {
      return c.json({ error: 'invalid body' }, 400);
    }
    const projects = deps.resolveProjects
      ? await deps.resolveProjects(body.projectIds)
      : body.projectIds.map((id) => ({ id, name: id }));
    if (projects.length < 2) {
      return c.json({ error: 'need at least two resolvable projects' }, 400);
    }

    let items = body.items;
    if (!items) {
      const planned = await planMultiTarget({
        task: body.task,
        projects,
        runPlanner:
          deps.runPlanner ??
          (async () => {
            throw new Error('planner unavailable');
          }),
      });
      items = planned.items;
    }

    try {
      const result = await startMultiTargetRuns({
        workflow: deps.defaultWorkflow ?? DEFAULT_WORKFLOW,
        inputBase: {
          autonomous: body.autonomous,
          runner: body.runner,
          model: body.model,
        },
        items,
        sourceRef: body.sourceRef as MultirepoSourceRef | undefined,
        getManager: deps.getManager,
      });
      return c.json(
        {
          groupId: result.groupId,
          runs: result.runs.map((r) => ({
            id: r.id,
            projectId: r.projectId,
            title: r.title,
            status: r.status,
            groupId: r.groupId,
            variant: r.variant,
          })),
          errors: result.errors,
        },
        201,
      );
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        400,
      );
    }
  });

  routes.get('/ext/multirepo/multi-target/groups/:groupId', async (c) => {
    const groupId = c.req.param('groupId');
    const view = await findMultiTargetGroup(groupId, {
      getRun: (projectId, runId) => {
        // Best-effort enrichment when managers are wired; otherwise members alone.
        const peeked = deps.getManager?.(projectId);
        if (!peeked || typeof (peeked as Promise<unknown>).then === 'function') return undefined;
        const manager = peeked as MultiTargetStartManager & {
          store: { getRun?: (id: string) => { id: string; title?: string; status?: string } | undefined };
        };
        return manager.store.getRun?.(runId) as never;
      },
    });
    if (!view) return c.json({ error: 'not found' }, 404);
    return c.json(view);
  });

  return routes;
}

/** Mounts `/ext/multirepo/*` onto the workspace `/api/v1` router. */
export function registerMultirepoExt(deps: MultirepoExtDeps): void {
  deps.app.route('/', buildRoutes(deps));
}

export type {
  MultirepoBoardConfig,
  MultirepoExtState,
  MultirepoGroup,
  MultirepoGroupMember,
  MultirepoSourceRef,
} from './state.ts';

export {
  emptyMultirepoState,
  loadMultirepoState,
  multirepoStatePath,
  saveMultirepoState,
  _setMultirepoHomeForTests,
} from './state.ts';

export { planMultiTarget, fallbackMultiTargetPlan } from './multi-target-plan.ts';
export { startMultiTargetRuns } from './multi-target-start.ts';
export { findMultiTargetGroup } from './multi-target-groups.ts';
export { extractJiraIssueKey, withJiraIssueKey } from './pr-issue-key.ts';
export {
  listJiraIssues,
  mapJiraSearchJson,
  type JiraBoardConfig,
  type JiraIssueSummary,
  type JiraListResult,
} from './board/jira.ts';
