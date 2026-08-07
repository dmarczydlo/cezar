import { Link, useParams } from 'react-router'
import { API_PREFIX } from '@open-mercato/cezar-api-client'
import { useQuery } from '@tanstack/react-query'
import {
  isKeepAllGroup,
  memberLabel,
  memberStatus,
  type MultiTargetGroupData,
} from './group-view'

/**
 * Multirepo group view — all linked PRs kept (no pick-one).
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
      const json = (await res.json()) as MultiTargetGroupData & { error?: string }
      if (!res.ok) throw new Error(json.error || `group failed (${res.status})`)
      return json as MultiTargetGroupData
    },
  })

  const data = query.data
  const keepAll = data ? isKeepAllGroup(data) : true

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4" data-slot="ext-multirepo-group">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">
          <Link to="/ext/multirepo/new" className="underline">
            New multi-repo task
          </Link>{' '}
          · Group
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Multi-repo group</h1>
        <p className="text-muted-foreground font-mono text-xs">{groupId}</p>
        {data?.sourceRef?.key ? (
          <p className="text-sm">
            Source:{' '}
            {data.sourceRef.url ? (
              <a className="underline" href={data.sourceRef.url} target="_blank" rel="noreferrer">
                {data.sourceRef.key}
              </a>
            ) : (
              <span className="font-mono">{data.sourceRef.key}</span>
            )}
          </p>
        ) : null}
      </header>

      {query.isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : null}
      {query.error ? (
        <p className="text-destructive text-sm">
          {query.error instanceof Error ? query.error.message : String(query.error)}
        </p>
      ) : null}

      {data ? (
        <>
          <ul className="flex flex-col gap-3" data-slot="ext-multirepo-members">
            {data.members.map((m) => {
              const status = memberStatus(m)
              return (
                <li
                  key={`${m.projectId}:${m.runId}`}
                  className="border-border flex flex-col gap-1 rounded-md border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono font-medium">{m.projectId}</span>
                    {status ? (
                      <span className="text-muted-foreground text-xs">{status}</span>
                    ) : null}
                  </div>
                  <Link
                    className="underline"
                    to={`/p/${encodeURIComponent(m.projectId)}/tasks/${encodeURIComponent(m.runId)}`}
                  >
                    {memberLabel(m)}
                  </Link>
                </li>
              )
            })}
          </ul>
          {keepAll ? (
            <p className="text-muted-foreground text-xs" data-slot="ext-multirepo-keep-all">
              All member runs and PRs are kept — there is no Pick / pick-one winner.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
