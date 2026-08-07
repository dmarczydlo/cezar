/**
 * Golden tests for the Cursor stream-json → v2 mapper.
 * Wire shapes from https://cursor.com/docs/cli/reference/output-format
 * and the dry-run mock `__fixtures__/cursor/mock-agent.mjs`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { UiEvent } from './ui-events.ts';
import {
  createCursorUiState,
  mapCursorMessage,
  type CursorUiMapping,
} from './cursor-ui-mapper.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '__fixtures__', 'cursor');

function replay(fixture: string): UiEvent[] {
  const raw = readFileSync(join(FIXTURES, `${fixture}.ndjson`), 'utf8');
  let state = createCursorUiState();
  const events: UiEvent[] = [];
  const push = (mapped: CursorUiMapping): void => {
    state = mapped.state;
    events.push(...mapped.events);
  };
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    push(mapCursorMessage(msg, state));
  }
  return events;
}

function expectedEvents(fixture: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, `${fixture}.expected.json`), 'utf8'));
}

const GOLDEN_FIXTURES = ['text-turn', 'tools-plan-task'] as const;

describe('cursor → v2 golden fixtures', () => {
  for (const fixture of GOLDEN_FIXTURES) {
    it(`maps ${fixture} to the exact UiEvent sequence`, () => {
      const actual = JSON.parse(JSON.stringify(replay(fixture)));
      expect(actual).toStrictEqual(expectedEvents(fixture));
    });
  }
});

describe('mapCursorMessage edge cases', () => {
  const state = createCursorUiState();

  it('non-object and unknown message types produce no events and never throw', () => {
    for (const msg of [null, undefined, 42, 'assistant', [], {}, { type: 'user' }, { type: 'thinking' }]) {
      const mapped = mapCursorMessage(msg, state);
      expect(mapped.events).toEqual([]);
      expect(mapped.state).toBe(state);
    }
  });

  it('skips assistant partial flushes that carry model_call_id', () => {
    const mapped = mapCursorMessage(
      {
        type: 'assistant',
        model_call_id: 'x',
        message: { role: 'assistant', content: [{ type: 'text', text: 'dup' }] },
      },
      state,
    );
    expect(mapped.events).toEqual([]);
  });
});
