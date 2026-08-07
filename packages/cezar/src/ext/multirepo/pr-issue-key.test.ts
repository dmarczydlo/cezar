import { describe, expect, it } from 'vitest';
import { extractJiraIssueKey, withJiraIssueKey } from './pr-issue-key.ts';

describe('pr-issue-key', () => {
  it('extracts a Jira key', () => {
    expect(extractJiraIssueKey('See PLAT-12 for details')).toBe('PLAT-12');
  });

  it('prefixes title when key missing', () => {
    expect(withJiraIssueKey('Add login', 'PLAT-1')).toBe('PLAT-1: Add login');
    expect(withJiraIssueKey('PLAT-1: Add login', 'PLAT-1')).toBe('PLAT-1: Add login');
  });
});
