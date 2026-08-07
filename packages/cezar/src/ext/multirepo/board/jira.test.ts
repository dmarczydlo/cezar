import { describe, expect, it, vi } from 'vitest';
import { listJiraIssues, mapJiraSearchJson } from './jira.ts';

describe('mapJiraSearchJson', () => {
  it('maps search issues to summaries with browse urls', () => {
    const issues = mapJiraSearchJson('https://acme.atlassian.net/', {
      issues: [
        {
          key: 'PLAT-1',
          fields: { summary: 'Add login', status: { name: 'To Do' } },
        },
        { key: 'PLAT-2', fields: { summary: 'Fix nav' } },
      ],
    });
    expect(issues).toEqual([
      {
        key: 'PLAT-1',
        summary: 'Add login',
        url: 'https://acme.atlassian.net/browse/PLAT-1',
        status: 'To Do',
      },
      {
        key: 'PLAT-2',
        summary: 'Fix nav',
        url: 'https://acme.atlassian.net/browse/PLAT-2',
      },
    ]);
  });
});

describe('listJiraIssues', () => {
  const config = {
    kind: 'jira' as const,
    baseUrl: 'https://acme.atlassian.net',
    email: 'dev@acme.test',
    apiTokenEnv: 'JIRA_API_TOKEN',
    jql: 'project = PLAT ORDER BY updated DESC',
  };

  it('is unavailable when the token env is missing', async () => {
    const result = await listJiraIssues(config, { env: {} });
    expect(result).toEqual({
      available: false,
      reason: 'missing env JIRA_API_TOKEN',
      issues: [],
    });
  });

  it('lists issues when search succeeds', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          issues: [
            {
              key: 'PLAT-9',
              fields: { summary: 'Ship multirepo', status: { name: 'In Progress' } },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await listJiraIssues(config, {
      env: { JIRA_API_TOKEN: 'tok' },
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.issues[0]).toMatchObject({
        key: 'PLAT-9',
        summary: 'Ship multirepo',
        status: 'In Progress',
      });
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = String(fetchMock.mock.calls[0]![0]);
    expect(calledUrl).toContain('/rest/api/3/search');
    expect(calledUrl).toContain('jql=');
  });
});
