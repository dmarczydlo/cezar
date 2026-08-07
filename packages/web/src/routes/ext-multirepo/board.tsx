import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { API_PREFIX } from '@open-mercato/cezar-api-client'
import { Button } from '@/components/ui/button'
import { SettingsField } from '@/routes/settings/settings-field'
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
 * Global Settings → Jira board (workspace-wide REST source for multi-repo tasks).
 * Also reachable from the sidebar Tools menu.
 */
export function JiraBoardSection() {
  const [form, setForm] = useState<BoardFormState>(emptyBoardForm)
  const [configured, setConfigured] = useState(false)
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
          setConfigured(true)
          setForm({
            baseUrl: json.board.baseUrl,
            email: json.board.email,
            apiTokenEnv: json.board.apiTokenEnv,
            jql: json.board.jql,
          })
        } else {
          setConfigured(false)
          setForm(emptyBoardForm())
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
      setConfigured(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function clearBoard() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`${API_PREFIX}/ext/multirepo/board`, { method: 'DELETE' })
      const json = (await res.json()) as BoardResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || `clear failed (${res.status})`)
      setConfigured(false)
      setForm(emptyBoardForm())
      setIssues(null)
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

  if (!loaded) {
    return (
      <p data-slot="jira-board-loading" className="p-4 text-[13px] text-soft-foreground md:p-6">
        Loading Jira board…
      </p>
    )
  }

  return (
    <div data-slot="jira-board-section" className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-6">
      <p className="text-[13px] text-muted-foreground">
        Workspace-wide Jira REST board for multi-repo tasks. The API token must live in an
        environment variable on the machine that runs cezar — never paste the token into this form.
        {configured ? (
          <span className="text-foreground"> Board is configured.</span>
        ) : (
          <span> Not configured (multi-repo compose still works).</span>
        )}
      </p>

      <SettingsField
        title="Atlassian site"
        hint="Your Jira Cloud base URL, e.g. https://your-org.atlassian.net"
      >
        <input
          className="border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-sm"
          value={form.baseUrl}
          onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          placeholder="https://your-org.atlassian.net"
          autoComplete="off"
        />
      </SettingsField>

      <SettingsField title="Email" hint="Atlassian account email used with the API token.">
        <input
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="you@company.com"
          autoComplete="username"
        />
      </SettingsField>

      <SettingsField
        title="API token env var name"
        hint="Name only — e.g. JIRA_API_TOKEN. Export that variable before starting cezar. Do not paste the token here."
      >
        <input
          className="border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-sm"
          value={form.apiTokenEnv}
          onChange={(e) => setForm({ ...form, apiTokenEnv: e.target.value })}
          placeholder="JIRA_API_TOKEN"
          autoComplete="off"
          spellCheck={false}
        />
      </SettingsField>

      <SettingsField title="JQL" hint="Issues listed when you load the board picker.">
        <textarea
          className="border-input bg-background min-h-24 w-full rounded-md border p-3 font-mono text-sm"
          value={form.jql}
          onChange={(e) => setForm({ ...form, jql: e.target.value })}
        />
      </SettingsField>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!canSaveBoard(form) || busy} onClick={() => void save()}>
          Save board
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !configured}
          onClick={() => void loadIssues()}
        >
          Load issues
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !configured}
          onClick={() => void clearBoard()}
        >
          Disable board
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link to="/ext/multirepo/new">New multi-repo task</Link>
        </Button>
      </div>

      {issues ? (
        <div className="flex flex-col gap-2">
          {!issues.available ? (
            <p className="text-[13px] text-muted-foreground">
              Board unavailable: {issues.reason ?? 'unknown'}
            </p>
          ) : issues.issues.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No issues matched.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {issues.issues.map((issue) => (
                <li key={issue.key} className="border-border rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <a
                      className="font-mono font-medium underline"
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer"
                    >
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

/** Legacy URL — keep bookmarks working. */
export function MultirepoBoardRoute() {
  return <Navigate to="/settings/global/jira" replace />
}
