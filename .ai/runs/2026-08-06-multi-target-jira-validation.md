# Validation — multi-target + Jira + Cursor runner

**Branch:** `feat/multi-target-jira`  
**Date:** 2026-08-07  
**Host:** local macOS (fork at `~/Workspace/cezar`)

## Checklist

1. **Ext pages load**
   - `/ext/multirepo/new`, `/ext/multirepo/board`, `/ext/multirepo/groups/:id` routed in `packages/web/src/routes.tsx`.
   - Cockpit entry: sidebar Layers control + ⌘K “Multi-repo task”.
   - Verified live: `GET /api/v1/ext/multirepo/health` → `{ ok: true, ext: "multirepo" }`; board GET → `{ configured: false, board: null }`.

2. **Multi-target plan → start**
   - Unit coverage: `src/ext/multirepo/` (20 tests) including plan, start, groups, Jira client.
   - UI: Plan enables Start; Start navigates to group view (no Pick).
   - Local registry had ≥2 projects (`salary-scrapper`, `cezar`) for live Plan/Start.

3. **Jira board seeds task; draft PR title has key**
   - Board PUT/GET + issues API mounted; UI seeds New-task via query (`jiraKey` / `jiraSummary` / `jiraUrl`).
   - Title stamp covered by `startMultiTargetRuns` test (`PLAT-9: …` via `withJiraIssueKey`).
   - Live Jira list not exercised (no token configured) — quiet degrade returns `available: false`.

4. **Cursor runner**
   - `createRunner('cursor')` → `CursorAgentRunner`; mock-bin stream-json test passes.
   - Picker catalog includes Cursor; provider probe uses `agent --version` / `CEZ_CURSOR_AGENT_BIN`.
   - Host did not have `agent` on PATH at validation time → expected `not-installed` until CLI install + `agent login` (or `CURSOR_API_KEY`).

5. **Upstream merge dry-run**
   - `git fetch upstream` (upstream/main advanced).
   - Trial merge of `upstream/main` into this branch: auto-merged `store.ts` / `server.ts`; **conflict** in `packages/web/src/components/command-palette.tsx` (our Multirepo palette item vs upstream edits).
   - Merge aborted — no conflict commit left on the branch.
   - Expected residual touch points on future rebase/merge: runner unions / `createRunner` / provider catalogs / `registerMultirepoExt` / ext web routes + palette/sidebar hooks.

## Notes

- VPS deploy of this fork not run in this pass (local cockpit only).
- Continue / multi-turn for Cursor is fresh-session only in v1 (documented in runner).
