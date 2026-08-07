/**
 * Jira Cloud REST client for the multirepo workspace board.
 * Token comes from env (`apiTokenEnv`); never persisted in state.json.
 */

export type JiraBoardConfig = {
  kind: 'jira';
  baseUrl: string;
  email: string;
  apiTokenEnv: string;
  jql: string;
};

export type JiraIssueSummary = {
  key: string;
  summary: string;
  url: string;
  status?: string;
};

export type JiraListResult =
  | { available: true; issues: JiraIssueSummary[] }
  | { available: false; reason: string; issues: [] };

type FetchLike = typeof fetch;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function issueBrowseUrl(baseUrl: string, key: string): string {
  return `${normalizeBaseUrl(baseUrl)}/browse/${encodeURIComponent(key)}`;
}

export function mapJiraSearchJson(
  baseUrl: string,
  payload: unknown,
): JiraIssueSummary[] {
  const root = payload as { issues?: unknown };
  if (!Array.isArray(root?.issues)) return [];
  const out: JiraIssueSummary[] = [];
  for (const raw of root.issues) {
    const issue = raw as {
      key?: unknown;
      fields?: { summary?: unknown; status?: { name?: unknown } };
    };
    if (typeof issue.key !== 'string' || !issue.key.trim()) continue;
    const summary =
      typeof issue.fields?.summary === 'string' ? issue.fields.summary : issue.key;
    const status =
      typeof issue.fields?.status?.name === 'string'
        ? issue.fields.status.name
        : undefined;
    out.push({
      key: issue.key,
      summary,
      url: issueBrowseUrl(baseUrl, issue.key),
      ...(status ? { status } : {}),
    });
  }
  return out;
}

export async function listJiraIssues(
  config: JiraBoardConfig,
  opts?: {
    env?: NodeJS.ProcessEnv;
    fetch?: FetchLike;
    maxResults?: number;
  },
): Promise<JiraListResult> {
  const env = opts?.env ?? process.env;
  const token = env[config.apiTokenEnv]?.trim();
  if (!token) {
    return {
      available: false,
      reason: `missing env ${config.apiTokenEnv}`,
      issues: [],
    };
  }

  const base = normalizeBaseUrl(config.baseUrl);
  if (!base) {
    return { available: false, reason: 'missing baseUrl', issues: [] };
  }

  const maxResults = opts?.maxResults ?? 50;
  const url = new URL(`${base}/rest/api/3/search`);
  url.searchParams.set('jql', config.jql);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('fields', 'summary,status');

  const auth = Buffer.from(`${config.email}:${token}`).toString('base64');
  const doFetch = opts?.fetch ?? fetch;

  let res: Response;
  try {
    res = await doFetch(url.toString(), {
      headers: {
        authorization: `Basic ${auth}`,
        accept: 'application/json',
      },
    });
  } catch (err) {
    return {
      available: false,
      reason: err instanceof Error ? err.message : String(err),
      issues: [],
    };
  }

  if (!res.ok) {
    return {
      available: false,
      reason: `jira search failed (${res.status})`,
      issues: [],
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { available: false, reason: 'invalid jira json', issues: [] };
  }

  return {
    available: true,
    issues: mapJiraSearchJson(base, json),
  };
}
