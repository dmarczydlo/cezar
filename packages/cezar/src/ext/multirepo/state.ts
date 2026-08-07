import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { cezarHomeDir } from '../../paths.ts';
import { atomicWriteJsonSync } from '../../workspace/config.ts';

/**
 * Isolated multirepo extension state (`~/.cezar/ext-multirepo/state.json`).
 * Holds Jira board config and multi-target group membership so RunRecord stays
 * untouched (upstream-friendly).
 */

export type MultirepoSourceRef = {
  kind: 'jira' | 'github' | 'file' | 'compose';
  key?: string;
  url?: string;
};

export type MultirepoBoardConfig = {
  kind: 'jira';
  baseUrl: string;
  email: string;
  apiTokenEnv: string;
  jql: string;
};

export type MultirepoGroupMember = {
  projectId: string;
  runId: string;
};

export type MultirepoGroup = {
  kind: 'multi-target';
  createdAt: string;
  sourceRef?: MultirepoSourceRef;
  members: MultirepoGroupMember[];
};

export type MultirepoExtState = {
  board?: MultirepoBoardConfig;
  groups: Record<string, MultirepoGroup>;
};

const sourceRefSchema = z
  .object({
    kind: z.enum(['jira', 'github', 'file', 'compose']),
    key: z.string().max(64).optional(),
    url: z.string().max(2048).optional(),
  })
  .passthrough();

const boardSchema = z
  .object({
    kind: z.literal('jira'),
    baseUrl: z.string().min(1).max(2048),
    email: z.string().min(1).max(320),
    apiTokenEnv: z.string().min(1).max(200),
    jql: z.string().min(1).max(4000),
  })
  .passthrough();

const groupMemberSchema = z
  .object({
    projectId: z.string().min(1).max(64),
    runId: z.string().min(1).max(200),
  })
  .passthrough();

const groupSchema = z
  .object({
    kind: z.literal('multi-target'),
    createdAt: z.string().max(64),
    sourceRef: sourceRefSchema.optional(),
    members: z.array(groupMemberSchema).default([]),
  })
  .passthrough();

const stateSchema = z
  .object({
    board: boardSchema.optional().catch(undefined),
    groups: z
      .record(z.string(), z.unknown())
      .default({})
      .catch({})
      .transform((raw) => {
        const out: Record<string, MultirepoGroup> = {};
        for (const [id, value] of Object.entries(raw)) {
          const parsed = groupSchema.safeParse(value);
          if (parsed.success) out[id] = parsed.data;
        }
        return out;
      }),
  })
  .passthrough();

/** Test-only override for the cezar home root (not the ext-multirepo dir). */
let homeOverride: string | undefined;

export function _setMultirepoHomeForTests(home: string | undefined): void {
  homeOverride = home;
}

export function multirepoStatePath(env: NodeJS.ProcessEnv = process.env): string {
  const home = homeOverride ?? cezarHomeDir(env);
  return join(home, 'ext-multirepo', 'state.json');
}

export function emptyMultirepoState(): MultirepoExtState {
  return { groups: {} };
}

export async function loadMultirepoState(
  env: NodeJS.ProcessEnv = process.env,
): Promise<MultirepoExtState> {
  const path = multirepoStatePath(env);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return emptyMultirepoState();
    console.warn(`[cez] multirepo state ${path} unreadable — using empty defaults`);
    return emptyMultirepoState();
  }
  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(`[cez] multirepo state ${path} is corrupt — using empty defaults`);
      return emptyMultirepoState();
    }
    return { board: parsed.data.board, groups: parsed.data.groups };
  } catch {
    console.warn(`[cez] multirepo state ${path} is corrupt — using empty defaults`);
    return emptyMultirepoState();
  }
}

export async function saveMultirepoState(
  state: MultirepoExtState,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const path = multirepoStatePath(env);
  const normalized = stateSchema.parse({
    board: state.board,
    groups: state.groups,
  });
  atomicWriteJsonSync(path, {
    ...(normalized.board ? { board: normalized.board } : {}),
    groups: normalized.groups,
  });
}
