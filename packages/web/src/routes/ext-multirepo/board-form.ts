/**
 * Pure helpers for the multirepo Jira board settings form.
 */

export type BoardFormState = {
  baseUrl: string
  email: string
  apiTokenEnv: string
  jql: string
}

export function emptyBoardForm(): BoardFormState {
  return {
    baseUrl: '',
    email: '',
    apiTokenEnv: 'JIRA_API_TOKEN',
    jql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC',
  }
}

export function boardPutBody(form: BoardFormState) {
  return {
    kind: 'jira' as const,
    baseUrl: form.baseUrl.trim(),
    email: form.email.trim(),
    apiTokenEnv: form.apiTokenEnv.trim() || 'JIRA_API_TOKEN',
    jql: form.jql.trim(),
  }
}

export function canSaveBoard(form: BoardFormState): boolean {
  return Boolean(
    form.baseUrl.trim() && form.email.trim() && form.apiTokenEnv.trim() && form.jql.trim(),
  )
}

export function issueSeedText(issue: { key: string; summary: string; url: string }): string {
  return `${issue.key}: ${issue.summary}\n\n${issue.url}\n`
}
