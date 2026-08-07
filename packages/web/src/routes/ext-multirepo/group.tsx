import { Link, useParams } from 'react-router'
import { API_PREFIX } from '@open-mercato/cezar-api-client'
import { useQuery } from '@tanstack/react-query'

type MultiTargetGroupResponse = {
  groupId: string
  task: string
  members: Array<{ projectId: string; runId: string }>
  sourceRef?: { kind: string; key?: string; url?: string }
}

/**
 * Multirepo group view — all linked PRs kept (no pick-one).
 * Full polish lands in Task 6; this shell is the Start navigation target.
 */
export function MultiTargetGroupRoute() {
  const { groupId = '' } = useParams()
  const query = useQuery({
    queryKey: ['ext-multirepo', 'group', groupId],
    enabled: Boolean(groupId),
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `${API_PREFIX}/ext/multirepo/multi-target/groups/${encodeURIComponent(groupId)}`,
        { signal },
      )
      const json = (await res.json()) as MultiTargetGroupResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || `group failed (${res.status})`)
      return json as MultiTargetGroupResponse
    },
  })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">
          <Link to="/ext/multirepo/new" className="underline">
            New multi-repo task
          </Link>{' '}
          · Group
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Multi-repo group</h1>
        <p className="text-muted-foreground font-mono text-xs">{groupId}</p>
      </header>

      {query.isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : null}
      {query.error ? (
        <p className="text-destructive text-sm">
          {query.error instanceof Error ? query.error.message : String(query.error)}
        </p>
      ) : null}

      {query.data ? (
        <>
          <p className="whitespace-pre-wrap text-sm">{query.data.task}</p>
          <ul className="flex flex-col gap-2">
            {query.data.members.map((m) => (
              <li key={`${m.projectId}:${m.runId}`} className="text-sm">
                <span className="font-mono font-medium">{m.projectId}</span>
                {' → '}
                <Link
                  className="underline"
                  to={`/p/${encodeURIComponent(m.projectId)}/tasks/${encodeURIComponent(m.runId)}`}
                >
                  {m.runId}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            All member PRs are kept — there is no pick-one winner.
          </p>
        </>
      ) : null}
    </div>
  )
}
