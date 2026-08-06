# Cezar fork: multi-target tasks + workspace Jira board

> Status: approved design (brainstorming)  
> Date: 2026-08-06  
> Upstream: [open-mercato/cezar](https://github.com/open-mercato/cezar)  
> Approach: thin fork — reuse `groupId` fan-out + additive workspace board

## Problem

Cezar already supports a **multi-project workspace** (one cockpit, many git repos). On the Myne VPS (`~/workspace/myne`), services such as `platform-core-service`, `platform-web-admin`, and `customer-api-service` are registered in `~/.cezar/config.json`.

What is missing:

1. **Cross-service work as one action** — a feature that spans FE + BE (or 2–3 services) still requires starting unrelated single-repo tasks.
2. **Jira as a task source** — the cockpit board today is GitHub Issues via `gh` / `ForgeDriver`; Myne work usually starts from a pasted/file spec or a Jira issue, optionally refined with `om-spec-writing`.

## Goals

- From **New task**: describe work or select a specification, multi-select services, one Start.
- **Plan first, then parallel**: a planner produces per-service prompts; then N linked agents run in their own repos/worktrees.
- Spec sources: **compose/paste/file (A)**, **Jira (B)**, **GitHub issue (C)** — usually A or B; optional refine via **`om-spec-writing`**.
- **Workspace-wide Jira board** (one config for the whole cezar home), via **REST API** (not MCP).
- Draft PRs include the Jira issue key in **title/body** (no Jira comments in v1).
- Keep a clean path to pull fixes from `open-mercato/cezar` (`upstream`).

## Non-goals (v1)

- Jira comments, transitions, or remote-link API on PR open.
- Named project “stacks” (user chose workspace-wide board instead).
- Pick-one-winner across services (variants remain same-repo competition only).
- MCP-based Jira board in the cockpit.
- Shared monorepo worktree / single agent editing multiple repos in one process.
- Deep platform rewrite of cezar’s project model.

## Context (existing cezar seams)

| Existing | Relevance |
|----------|-----------|
| Multi-project workspace (`~/.cezar/config.json`) | Already lists all Myne services; tasks remain one `repoRoot` each. |
| Parallel variants (`groupId`, `startVariants`) | Closest fan-out pattern — same repo, competing prompts, pick one winner. |
| Chain planner (`planner.ts`) | One-repo step planning; extend for multi-target prompt split. |
| `ForgeDriver` (GitHub) | Per-repo forge for issues/PRs; do not conflate with workspace Jira board. |
| Skills (`om-spec-writing`) | Available on the host; optional refine step before plan/fan-out. |

## User flow

1. **Source** — compose text, attach/paste markdown, pick a **Jira** issue (workspace board), or pick a **GitHub** issue.
2. **Optional refine** — run `om-spec-writing`; user may edit the result.
3. **Targets** — multi-select registered projects (e.g. core + web-admin + customer-api). One or zero extra targets → today’s single-run path.
4. **Plan** — one planner call: full spec + selected services → one scoped prompt per service.
5. **Fan-out** — N linked runs, shared `groupId`, `groupKind: "multi-target"`, each bound to its `projectId` / worktree. Parallel under existing `maxParallel`.
6. **Review** — group view shows all children; keep all successful outcomes (no pick-one). Draft PRs include `PROJ-123` when Jira-sourced (or key detected in spec).

## Architecture

```
                    ┌─────────────────────────┐
                    │  New task (cockpit)     │
                    │  source + targets +     │
                    │  optional om-spec       │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │  Multi-target planner   │
                    │  → { projectId, prompt }│
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        RunManager A      RunManager B      RunManager C
        (repo A)          (repo B)          (repo C)
              │                 │                 │
              ▼                 ▼                 ▼
           PR (+key)         PR (+key)         PR (+key)
```

### Components

| Piece | Responsibility |
|-------|----------------|
| **Workspace board provider** | List/pick Jira issues via REST for the cockpit. Configured once in `~/.cezar`. |
| **Cross-project starter** | Like `startVariants`, but targets are `{ projectId, prompt }[]` with `groupKind: "multi-target"`. |
| **Multi-target planner** | Spec + selected projects → per-project prompts; fallback if planning fails. |
| **New-task UI** | Source picker, project multi-select, optional om-spec, Plan → Start. |
| **PR title helper** | Ensures Jira issue key in draft PR title/body. |

GitHub remains the per-project **forge** (PRs, checks). Jira is a **workspace board** only in v1 — not a full `ForgeDriver` replacement.

## Data model

### Workspace config (additive in `~/.cezar/config.json`)

```json
{
  "board": {
    "kind": "jira",
    "baseUrl": "https://example.atlassian.net",
    "email": "user@example.com",
    "apiTokenEnv": "JIRA_API_TOKEN",
    "jql": "assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC"
  }
}
```

- Omit `board` or use non-jira → no Jira board UI (GitHub per project unchanged).
- API token **only** via environment variable named by `apiTokenEnv`; never stored in repo `.ai/cezar/` or committed config.

### Run record (additive)

- Reuse `groupId` (and optionally `variant` unused / reserved for multi-target labels).
- `groupKind: "variants" | "multi-target"`.
- `sourceRef?: { kind: "jira" | "github" | "file" | "compose"; key?: string; url?: string }`.
- Each child run remains single-project (`projectId` / `repoRoot`).

## Jira integration

- **Transport:** Jira Cloud REST (search + issue fetch) with email + API token basic auth.
- **UX:** Workspace Board lists issues from configured JQL; “Use in New task” seeds composer and sets `sourceRef`.
- **Degrade:** missing URL/token/network → `available: false` + human hint; compose/file/GitHub still work.
- **PR linking:** include issue key in title/body and link to issue URL in body. No Jira-side comments in v1.

## Error handling

| Case | Behavior |
|------|----------|
| Jira unavailable | Board empty + hint; other sources work. |
| Planner fails / bad JSON | Fan-out with full spec + “you own `<service>`” + sibling list. |
| One child fails | Siblings continue; group shows mixed status. |
| 0–1 targets | Existing single-run path. |
| Non-git target selected | Refuse/skip that target; continue if ≥1 valid. |
| `om-spec-writing` missing | Skip refine; keep raw source. |

## Fork & upstream sync

1. Fork `open-mercato/cezar` on GitHub.
2. Remotes: `origin` = fork, `upstream` = `open-mercato/cezar`.
3. Implement behind additive seams (board config, multi-target starter, New-task UI) to minimize merge conflict with upstream `main`.
4. Periodically: `git fetch upstream` && merge or rebase onto `upstream/main`.

Do not reshape protected GitHub forge list payloads (`BACKWARD_COMPATIBILITY` surfaces).

## Testing

**Automated**

- Planner unit tests: multi-service sample → N scoped prompts; fallback path.
- Starter: N runs, shared `groupId`, `groupKind: "multi-target"`, correct `projectId`; single-target unchanged.
- Jira board: mocked REST list/map; missing token → unavailable.
- PR helper: Jira `sourceRef` → title contains `PROJ-123`.

**Manual (Myne VPS)**

- Paste spec → select `platform-core-service` + `platform-web-admin` → Plan → Start → two worktrees/PRs.
- Jira-sourced task → draft PR titles carry the key.
- Upstream merge remains clean on untouched core paths.

## Success criteria

- One cockpit action yields linked parallel runs after a plan step (no manual BE/FE double-start for this flow).
- Workspace Jira board can seed New task without MCP.
- Draft PRs carry the Jira issue key when applicable.
- Upstream open-mercato changes remain pullable with manageable conflicts.

## Implementation notes (for later planning)

Suggested build order:

1. Fork + upstream remote wiring (no feature code).
2. Additive run fields + multi-target starter (API + tests).
3. Multi-target planner + New-task multi-select UI.
4. Workspace Jira board (config + REST + UI picker).
5. PR title/body key injection.
6. Optional om-spec refine step wiring.
7. VPS manual validation against Myne services.

## Resolved decisions

| Topic | Decision |
|-------|----------|
| Cross-service UX | One New task → multi-select services → plan → parallel linked runs |
| Coordination | Plan first, then parallel (not fully blind parallel, not BE-then-FE ordered) |
| Spec sources | Compose/file, Jira, GitHub; usually compose/file or Jira; optional `om-spec-writing` |
| Jira access | REST API from cezar server |
| Board scope | One Jira board for the whole workspace |
| PR ↔ Jira | Issue key in PR title/body only |
| Approach | Thin fork reusing `groupId` / variants fan-out pattern |
