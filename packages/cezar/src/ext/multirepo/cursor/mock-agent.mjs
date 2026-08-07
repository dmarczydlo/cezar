#!/usr/bin/env node
// Mock `agent` binary for CEZ_DRY_RUN=1 — emits Cursor-shaped stream-json.

import { appendFileSync } from 'node:fs';

if (process.env.CEZ_MOCK_ARGS_FILE) {
  try {
    appendFileSync(process.env.CEZ_MOCK_ARGS_FILE, `${JSON.stringify(process.argv.slice(2))}\n`);
  } catch {
    /* ignore */
  }
}

const emit = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
const sessionId = 'mock-cursor-session';

emit({
  type: 'system',
  subtype: 'init',
  apiKeySource: 'login',
  cwd: process.cwd(),
  session_id: sessionId,
  model: 'mock',
  permissionMode: 'default',
});

emit({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'mock: cursor dry-run completed the task.' }],
  },
  session_id: sessionId,
});

emit({
  type: 'result',
  subtype: 'success',
  duration_ms: 10,
  duration_api_ms: 10,
  is_error: false,
  result: 'mock: cursor dry-run completed the task.',
  session_id: sessionId,
});

process.exit(0);
