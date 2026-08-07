import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from './runner-factory.ts';
import {
  buildCursorArgs,
  CursorAgentRunner,
  mockCursorAgentPath,
} from './cursor-agent-runner.ts';
import { mapCursorStreamEvent } from './cursor-ui-mapper.ts';

describe('buildCursorArgs', () => {
  it('builds print-mode args with force and stream-json', () => {
    expect(buildCursorArgs({ userPrompt: 'hi', cwd: '/tmp' })).toEqual(
      expect.arrayContaining(['-p', '--force', '--output-format', 'stream-json']),
    );
    expect(buildCursorArgs({ userPrompt: 'hi', cwd: '/tmp' }).at(-1)).toBe('hi');
  });
});

describe('mapCursorStreamEvent', () => {
  it('maps assistant text and terminal result', () => {
    expect(
      mapCursorStreamEvent({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      }),
    ).toEqual([{ type: 'text', text: 'hello' }]);
    expect(mapCursorStreamEvent({ type: 'result', subtype: 'success', is_error: false })).toEqual([
      { type: 'done' },
    ]);
  });
});

describe('createRunner(cursor)', () => {
  it('returns CursorAgentRunner', () => {
    const runner = createRunner('cursor');
    expect(runner.backend).toBe('cursor');
  });
});

describe('CursorAgentRunner mock bin', () => {
  it('feeds stream-json and emits text + done', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cursor-runner-'));
    try {
      const events: Array<{ type: string }> = [];
      const runner = new CursorAgentRunner({ bin: mockCursorAgentPath(), timeoutMs: 15_000 });
      const result = await runner.run({ userPrompt: 'hi', cwd }, (e) => events.push(e));
      expect(result.text).toContain('mock: cursor');
      expect(events.some((e) => e.type === 'text')).toBe(true);
      expect(events.some((e) => e.type === 'done')).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
