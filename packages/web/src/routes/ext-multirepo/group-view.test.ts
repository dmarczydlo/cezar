import { describe, expect, it } from 'vitest'
import { isKeepAllGroup, memberLabel, memberStatus } from './group-view'

describe('isKeepAllGroup', () => {
  it('marks multi-target groups as keep-all (no pick-one)', () => {
    expect(
      isKeepAllGroup({
        groupId: 'g1',
        groupKind: 'multi-target',
        members: [
          { projectId: 'a', runId: 'r1' },
          { projectId: 'b', runId: 'r2' },
        ],
      }),
    ).toBe(true)
  })
})

describe('memberLabel', () => {
  it('prefers run title, falls back to run id', () => {
    expect(memberLabel({ projectId: 'a', runId: 'r1', run: { title: 'PLAT-1: FE' } })).toBe(
      'PLAT-1: FE',
    )
    expect(memberLabel({ projectId: 'a', runId: 'r1' })).toBe('r1')
  })
})

describe('memberStatus', () => {
  it('reads optional status', () => {
    expect(memberStatus({ projectId: 'a', runId: 'r1', run: { status: 'running' } })).toBe(
      'running',
    )
    expect(memberStatus({ projectId: 'a', runId: 'r1' })).toBeUndefined()
  })
})
