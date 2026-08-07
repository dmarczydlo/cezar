import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MultiTargetGroupRoute } from './group'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderGroup(groupId = 'g1') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/ext/multirepo/groups/${groupId}`]}>
        <Routes>
          <Route path="/ext/multirepo/groups/:groupId" element={<MultiTargetGroupRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MultiTargetGroupRoute', () => {
  it('renders project labels and has no Pick control', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            groupId: 'g1',
            groupKind: 'multi-target',
            createdAt: '2026-08-06T00:00:00.000Z',
            members: [
              {
                projectId: 'platform-core-service',
                runId: 'r-be',
                run: { title: 'PLAT-1: API', status: 'done' },
              },
              {
                projectId: 'platform-web-admin',
                runId: 'r-fe',
                run: { title: 'PLAT-1: UI', status: 'running' },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    renderGroup()

    expect(await screen.findByText('platform-core-service')).toBeTruthy()
    expect(screen.getByText('platform-web-admin')).toBeTruthy()
    expect(screen.getByText('PLAT-1: API')).toBeTruthy()
    expect(screen.getByText('PLAT-1: UI')).toBeTruthy()
    expect(screen.getByText(/no Pick/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /pick/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /pick/i })).toBeNull()
  })
})
