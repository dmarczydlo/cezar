import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { API_PREFIX } from '@open-mercato/cezar-api-client'
import {
  boardPutBody,
  canSaveBoard,
  emptyBoardForm,
  type BoardFormState,
} from './board-form'

type BoardResponse =
  | { configured: false; board: null }
  | {
      configured: true
      board: {
        kind: 'jira'
        baseUrl: string
        email: string
        apiTokenEnv: string
        jql: string
      }
    }

type IssuesResponse = {
  available: boolean
  reason?: string
  issues: Array<{ key: string; summary: string; url: string; status?: string }>
}

/**
 * Workspace Jira board settings + issue list for seeding multi-repo tasks.
 */
export function MultirepoBoardRoute() {
  const [form, setForm] = useState<BoardFormState>(emptyBoardForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<IssuesResponse | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_PREFIX}/ext/multirepo/board`)
        const json = (await res.json()) as BoardResponse
        if (json.configured && json.board) {
          setForm({
            baseUrl: json.board.baseUrl,
            email: json.board.email,
            apiTokenEnv: json.board.apiTokenEnv,
            jql: json.board.jql,
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoaded(true)
      }
    })()
  }, [])

  async function save() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`${API_PREFIX}/ext/multirepo/board`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(boardPutBody(form)),
      })
      const json = (await res.json()) as BoardResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || `save failed (${res.status})`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function loadIssues() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`${API_PREFIX}/ext/multirepo/board/issues`)
      const json = (await res.json()) as IssuesResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || `issues failed (${res.status})`)
      setIssues(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">
          <Link to="/ext/multirepo/new" className="underline">
            New multi-repo task
          </Link>{' '}
          · Board
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Jira board</h1>
        <p className="text-muted-foreground text-sm">
          Workspace-wide REST board. Token stays in an env var — never in state.json.
        </p>
      </header>

      {!loaded ? <p className="text-muted-foreground text-sm">Loading…</p> : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Base URL</span>
        <input
          className="border-input bg-background rounded-md border px-3 py-2 font-mono text-sm"
          value={form.baseUrl}
          onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          placeholder="https://your-org.atlassian.net"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Email</span>
        <input
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="you@company.com"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">API token env var</span>
        <input
          className="border-input bg-background rounded-md border px-3 py-2 font-mono text-sm"
          value={form.apiTokenEnv}
          onChange={(e) => setForm({ ...form, apiTokenEnv: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">JQL</span>
        <textarea
          className="border-input bg-background min-h-24 rounded-md border p-3 font-mono text-sm"
          value={form.jql}
          onChange={(e) => setForm({ ...form, jql: e.target.value })}
        />
      </label>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm disabled:opacity-50"
          disabled={!canSaveBoard(form) || busy}
          onClick={() => void save()}
        >
          Save board
        </button>
        <button
          type="button"
          className="bg-secondary text-secondary-foreground rounded-md px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={() => void loadIssues()}
        >
          Load issues
        </button>
      </div>

      {issues ? (
        <div className="flex flex-col gap-2">
          {!issues.available ? (
            <p className="text-muted-foreground text-sm">
              Board unavailable: {issues.reason ?? 'unknown'}
            </p>
          ) : issues.issues.length === 0 ? (
            <p className="text-muted-foreground text-sm">No issues matched.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {issues.issues.map((issue) => (
                <li key={issue.key} className="border-border rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <a className="font-mono font-medium underline" href={issue.url} target="_blank" rel="noreferrer">
                      {issue.key}
                    </a>
                    {issue.status ? (
                      <span className="text-muted-foreground text-xs">{issue.status}</span>
                    ) : null}
                  </div>
                  <p>{issue.summary}</p>
                  <Link
                    className="text-sm underline"
                    to={`/ext/multirepo/new?jiraKey=${encodeURIComponent(issue.key)}&jiraSummary=${encodeURIComponent(issue.summary)}&jiraUrl=${encodeURIComponent(issue.url)}`}
                  >
                    Use in multi-repo task
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
