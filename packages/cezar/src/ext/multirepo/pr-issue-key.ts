/** Jira issue-key helpers for stamping run titles (stock draft PR uses run.title). */

const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export function extractJiraIssueKey(text: string): string | undefined {
  const m = text.match(JIRA_KEY_RE);
  return m?.[1];
}

/** Prefix `${key}: ` when key is set and not already present in the title. */
export function withJiraIssueKey(title: string, key: string | undefined): string {
  if (!key) return title;
  if (title.includes(key)) return title;
  return `${key}: ${title}`;
}

export function appendJiraLinkToPrBody(body: string, url: string | undefined): string {
  if (!url?.trim()) return body;
  if (body.includes(url)) return body;
  return `${body.trimEnd()}\n\nJira: ${url}\n`;
}
