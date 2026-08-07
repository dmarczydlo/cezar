import { describe, expect, it } from 'vitest'
import { boardPutBody, canSaveBoard, emptyBoardForm, issueSeedText } from './board-form'

describe('board form helpers', () => {
  it('builds a put body and validates required fields', () => {
    const form = {
      ...emptyBoardForm(),
      baseUrl: 'https://acme.atlassian.net',
      email: 'dev@acme.test',
      jql: 'project = PLAT',
    }
    expect(canSaveBoard(form)).toBe(true)
    expect(boardPutBody(form)).toEqual({
      kind: 'jira',
      baseUrl: 'https://acme.atlassian.net',
      email: 'dev@acme.test',
      apiTokenEnv: 'JIRA_API_TOKEN',
      jql: 'project = PLAT',
    })
    expect(canSaveBoard(emptyBoardForm())).toBe(false)
  })

  it('seeds composer text from an issue', () => {
    expect(
      issueSeedText({
        key: 'PLAT-1',
        summary: 'Add login',
        url: 'https://acme.atlassian.net/browse/PLAT-1',
      }),
    ).toContain('PLAT-1: Add login')
  })
})
