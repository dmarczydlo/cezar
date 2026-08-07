import { Hono } from 'hono';

/**
 * Multirepo extension registration seam.
 * Keep upstream touch points to a single call from `createApp` / server bootstrap.
 */

export type MultirepoExtDeps = {
  /** Workspace-level Hono app already mounted under `/api/v1`. */
  app: Hono;
};

const multirepoRoutes = new Hono().get('/ext/multirepo/health', (c) =>
  c.json({ ok: true, ext: 'multirepo' }),
);

/** Mounts `/ext/multirepo/*` onto the workspace `/api/v1` router. */
export function registerMultirepoExt(deps: MultirepoExtDeps): void {
  deps.app.route('/', multirepoRoutes);
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
