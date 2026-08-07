import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { API_PREFIX } from '@open-mercato/cezar-api-client'
import { useProjects } from '@/api/queries'
import { issueSeedText } from './board-form'
import { buildSubmitBody, toggleProjectId, type MultiTargetPlanItem } from './new-multi-target-form'

type SourceRef = { kind: 'compose' | 'jira' | 'github' | 'file'; key?: string; url?: string }

function sourceRefFromSearch(params: URLSearchParams): { task: string; sourceRef: SourceRef } {
  const key = params.get('jiraKey')?.trim()
  const summary = params.get('jiraSummary')?.trim()
  const url = params.get('jiraUrl')?.trim()
  if (key && summary && url) {
    return {
      task: issueSeedText({ key, summary, url }),
      sourceRef: { kind: 'jira', key, url },
    }
  }
  return { task: '', sourceRef: { kind: 'compose' } }
}

/**
 * Isolated multirepo New-task UI — plan-then-parallel across selected projects.
 * Stock `/p/:id/new` is unchanged.
 */
export function NewMultiTargetRoute() {
  const projects = useProjects()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const seeded = useMemo(() => sourceRefFromSearch(searchParams), [searchParams])
  const [task, setTask] = useState(seeded.task)
  const [sourceRef, setSourceRef] = useState<SourceRef>(seeded.sourceRef)
  const [selected, setSelected] = useState<string[]>([])
  const [items, setItems] = useState<MultiTargetPlanItem[] | null>(null)
  const [fallback, setFallback] = useState(false)
  const [rationale, setRationale] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autonomous, setAutonomous] = useState(true)

  const registry = projects.data?.projects ?? []
  const canPlan = task.trim().length > 0 && selected.length >= 2

  const submitPreview = useMemo(
    () =>
      buildSubmitBody({
        task,
        selectedProjectIds: selected,
        items: items ?? undefined,
        sourceRef,
        autonomous,
      }),
    [task, selected, items, sourceRef, autonomous],
  )

  async function plan() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`${API_PREFIX}/ext/multirepo/multi-target/plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task, projectIds: selected }),
      })
      const json = (await res.json()) as {
        items?: MultiTargetPlanItem[]
        fallback?: boolean
        rationale?: string
        error?: string
      }
      if (!res.ok) throw new Error(json.error || `plan failed (${res.status})`)
      setItems(json.items ?? [])
      setFallback(Boolean(json.fallback))
      setRationale(json.rationale ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    setError(null)
    const body = buildSubmitBody({
      task,
      selectedProjectIds: selected,
      items: items ?? undefined,
      sourceRef,
      autonomous,
    })
    if (body.mode !== 'multi-target') {
      setError('Select at least two projects for a multi-repo run')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`${API_PREFIX}/ext/multirepo/multi-target/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          task: body.task,
          projectIds: body.projectIds,
          items: body.items,
          sourceRef: body.sourceRef,
          autonomous: body.autonomous,
        }),
      })
      const json = (await res.json()) as { groupId?: string; error?: string }
      if (!res.ok) throw new Error(json.error || `start failed (${res.status})`)
      if (!json.groupId) throw new Error('start returned no groupId')
      void navigate(`/ext/multirepo/groups/${encodeURIComponent(json.groupId)}`)
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
          <Link to="/" className="underline">
            Cockpit
          </Link>{' '}
          ·{' '}
          <Link to="/settings/global/jira" className="underline">
            Jira board
          </Link>{' '}
          · Multirepo
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">New multi-repo task</h1>
        <p className="text-muted-foreground text-sm">
          Describe one feature, pick 2+ services, plan per-repo prompts, then start linked runs.
          {sourceRef.kind === 'jira' && sourceRef.key
            ? ` Seeded from ${sourceRef.key}.`
            : null}
        </p>
      </header>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Specification</span>
        <textarea
          className="border-input bg-background min-h-40 rounded-md border p-3 font-mono text-sm"
          value={task}
          onChange={(e) => {
            setTask(e.target.value)
            setItems(null)
            if (sourceRef.kind === 'jira') {
              // Keep the Jira key/url for PR stamping even if the user edits the body.
              setSourceRef((cur) => cur)
            } else {
              setSourceRef({ kind: 'compose' })
            }
          }}
          placeholder="Feature / acceptance criteria…"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Target projects</legend>
        {projects.isLoading ? (
          <p className="text-muted-foreground text-sm">Loading projects…</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {registry.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => {
                      setSelected((cur) => toggleProjectId(cur, p.id))
                      setItems(null)
                    }}
                  />
                  <span className="font-mono">{p.id}</span>
                  {p.name && p.name !== p.id ? (
                    <span className="text-muted-foreground">({p.name})</span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={autonomous}
          onChange={(e) => setAutonomous(e.target.checked)}
        />
        Autonomous
      </label>

      {items ? (
        <div className="flex flex-col gap-3">
          <div className="text-muted-foreground text-sm">
            Plan ready{fallback ? ' (fallback)' : ''}. {rationale}
          </div>
          {items.map((item, idx) => (
            <label key={item.projectId} className="flex flex-col gap-1 text-sm">
              <span className="font-mono font-medium">{item.projectId}</span>
              <textarea
                className="border-input bg-background min-h-28 rounded-md border p-3 font-mono text-sm"
                value={item.prompt}
                onChange={(e) => {
                  const next = [...items]
                  next[idx] = { ...item, prompt: e.target.value }
                  setItems(next)
                }}
              />
            </label>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="bg-secondary text-secondary-foreground rounded-md px-3 py-2 text-sm disabled:opacity-50"
          disabled={!canPlan || busy}
          onClick={() => void plan()}
        >
          {busy && !items ? 'Planning…' : 'Plan'}
        </button>
        <button
          type="button"
          className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm disabled:opacity-50"
          disabled={submitPreview.mode !== 'multi-target' || busy || !items}
          onClick={() => void start()}
        >
          {busy && items ? 'Starting…' : 'Start'}
        </button>
      </div>
    </div>
  )
}
