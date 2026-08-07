import { describe, expect, it } from 'vitest';
import { fallbackMultiTargetPlan, planMultiTarget } from './multi-target-plan.ts';

const projects = [
  { id: 'platform-core-service', name: 'platform-core-service' },
  { id: 'platform-web-admin', name: 'platform-web-admin' },
];

describe('fallbackMultiTargetPlan', () => {
  it('scopes each prompt to its service and lists siblings', () => {
    const items = fallbackMultiTargetPlan('Add feature X', projects);
    expect(items).toHaveLength(2);
    expect(items[0].prompt).toContain('platform-core-service');
    expect(items[0].prompt).toContain('Add feature X');
    expect(items[0].prompt).toMatch(/sibling|other services/i);
  });
});

describe('planMultiTarget', () => {
  it('parses planner JSON into per-project prompts', async () => {
    const result = await planMultiTarget({
      task: 'Add feature X',
      projects,
      runPlanner: async () =>
        JSON.stringify({
          rationale: 'split by layer',
          items: [
            { projectId: 'platform-core-service', prompt: 'BE: implement API' },
            { projectId: 'platform-web-admin', prompt: 'FE: wire UI' },
          ],
        }),
    });
    expect(result.fallback).toBe(false);
    expect(result.items[1].prompt).toBe('FE: wire UI');
  });

  it('degrades to fallback when planner returns garbage', async () => {
    const result = await planMultiTarget({
      task: 'Add feature X',
      projects,
      runPlanner: async () => 'not-json',
    });
    expect(result.fallback).toBe(true);
    expect(result.items).toHaveLength(2);
  });
});
