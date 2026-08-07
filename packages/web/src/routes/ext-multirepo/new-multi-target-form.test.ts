import { describe, expect, it } from 'vitest'
import { buildSubmitBody, toggleProjectId } from './new-multi-target-form'

describe('buildSubmitBody', () => {
  it('uses multi-target payload when 2+ projects selected', () => {
    const body = buildSubmitBody({
      task: 'Feature X',
      selectedProjectIds: ['platform-core-service', 'platform-web-admin'],
      items: [
        { projectId: 'platform-core-service', prompt: 'BE' },
        { projectId: 'platform-web-admin', prompt: 'FE' },
      ],
      sourceRef: { kind: 'compose' },
    })
    expect(body.mode).toBe('multi-target')
    if (body.mode === 'multi-target') {
      expect(body.projectIds).toHaveLength(2)
      expect(body.items?.[1].prompt).toBe('FE')
    }
  })

  it('stays single-project when one id selected', () => {
    const body = buildSubmitBody({
      task: 'Feature X',
      selectedProjectIds: ['platform-core-service'],
    })
    expect(body).toEqual({
      mode: 'single',
      task: 'Feature X',
      projectId: 'platform-core-service',
    })
  })
})

describe('toggleProjectId', () => {
  it('adds and removes ids', () => {
    expect(toggleProjectId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleProjectId(['a', 'b'], 'a')).toEqual(['b'])
  })
})
