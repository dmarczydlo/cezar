/**
 * Cursor Agent CLI runner (`agent`) — headless print mode.
 * Impl lives in ext/multirepo; core only registers via createRunner.
 *
 * Continue / multi-turn: v1 is fresh-session only (print mode exits when done).
 */

import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import type {
  AgentEvent,
  AgentRunResult,
  AgentRunSpec,
  AgentRunner,
  AgentSession,
  AgentToolCallRecord,
  ContentBlock,
  SessionOptions,
} from '../../../core/agent-runner.ts';
import { isSignalTerminationExit, prependSystemPrompt } from '../../../core/agent-runner.ts';
import { buildChildEnv } from '../../../core/agent-env.ts';
import { readNdjson } from '../../../core/ndjson.ts';
import { mapCursorStreamEvent } from './cursor-ui-mapper.ts';

export const DEFAULT_CURSOR_TIMEOUT_MS = 30 * 60_000;
export const CURSOR_KILL_GRACE_MS = 10_000;

export interface CursorAgentRunnerOptions {
  bin?: string;
  timeoutMs?: number;
}

export type BuildCursorArgsInput = {
  userPrompt: string;
  cwd: string;
  systemPrompt?: string;
  model?: string;
};

/** CLI argv for headless write mode (prompt is the final positional). */
export function buildCursorArgs(input: BuildCursorArgsInput): string[] {
  const prompt = prependSystemPrompt(input.systemPrompt, input.userPrompt);
  const args = ['-p', '--force', '--trust', '--output-format', 'stream-json'];
  if (input.model?.trim()) {
    args.push('--model', input.model.trim());
  }
  args.push(prompt);
  return args;
}

export function mockCursorAgentPath(): string {
  return resolvePath(dirname(fileURLToPath(import.meta.url)), 'mock-agent.mjs');
}

export function resolveCursorBin(optsBin?: string): string {
  if (optsBin) return optsBin;
  if (process.env.CEZ_CURSOR_AGENT_BIN) return process.env.CEZ_CURSOR_AGENT_BIN;
  if (process.env.CEZ_DRY_RUN === '1') return mockCursorAgentPath();
  return 'agent';
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  if (child.exitCode != null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => {
    const fin = (code: number | null) => resolve(code);
    child.once('close', fin);
    child.once('exit', fin);
    child.once('error', () => fin(child.exitCode ?? null));
  });
}

export class CursorAgentRunner implements AgentRunner {
  readonly backend = 'cursor' as const;

  private readonly bin: string;
  private readonly timeoutMs: number;
  private lastSession: AgentSession | null = null;

  constructor(opts: CursorAgentRunnerOptions = {}) {
    this.bin = resolveCursorBin(opts.bin);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_CURSOR_TIMEOUT_MS;
  }

  run(spec: AgentRunSpec, onEvent?: (event: AgentEvent) => void): Promise<AgentRunResult> {
    return this.startSession(spec, onEvent, { autoEndAfterFirstTurn: true }).result;
  }

  async interrupt(): Promise<void> {
    this.lastSession?.interrupt();
  }

  startSession(
    spec: AgentRunSpec,
    onEvent?: (event: AgentEvent) => void,
    _opts: SessionOptions = {},
  ): AgentSession {
    const args = buildCursorArgs({
      userPrompt: spec.userPrompt,
      cwd: spec.cwd,
      systemPrompt: spec.systemPrompt,
      model: spec.model,
    });

    let child: ChildProcessWithoutNullStreams;
    try {
      const isNodeScript = /\.[cm]?js$/.test(this.bin);
      child = nodeSpawn(
        isNodeScript ? process.execPath : this.bin,
        isNodeScript ? [this.bin, ...args] : args,
        {
          cwd: spec.cwd,
          env: buildChildEnv({ backend: this.backend, extraEnv: spec.env }),
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`failed to spawn Cursor agent (${this.bin}): ${message}`);
    }

    const toolCalls: AgentToolCallRecord[] = [];
    const textChunks: string[] = [];
    let sessionId = spec.sessionId;
    let open = true;
    let terminatedByCezar = false;
    let timedOut = false;
    const stderrChunks: string[] = [];

    const emit = (event: AgentEvent) => {
      if (event.type === 'text') textChunks.push(event.text);
      if (event.type === 'tool-call') {
        toolCalls.push({ id: event.id, name: event.tool, input: event.input });
      }
      if (event.type === 'session') sessionId = event.sessionId;
      onEvent?.(event);
    };

    const limitMs = spec.timeoutMs ?? this.timeoutMs;
    let deadline: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    if (limitMs > 0) {
      deadline = setTimeout(() => {
        timedOut = true;
        terminatedByCezar = true;
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        killTimer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            /* ignore */
          }
        }, CURSOR_KILL_GRACE_MS);
        killTimer.unref?.();
      }, limitMs);
      deadline.unref?.();
    }

    const result = (async (): Promise<AgentRunResult> => {
      try {
        for await (const line of readNdjson(child.stdout)) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }
          for (const event of mapCursorStreamEvent(parsed)) emit(event);
        }
      } catch {
        if (!timedOut) {
          /* premature close — fall through to exit handling */
        }
      } finally {
        if (deadline) clearTimeout(deadline);
        if (killTimer) clearTimeout(killTimer);
        open = false;
      }

      const exitCode = await waitForExit(child);
      const text = textChunks.join('').trim();

      if (timedOut) {
        const mins = Math.round((limitMs / 60_000) * 10) / 10;
        onEvent?.({ type: 'error', message: `cursor agent timed out after ${mins}m and was killed` });
        onEvent?.({ type: 'done' });
        return { text, toolCalls, tokensUsed: 0, sessionId };
      }

      if (terminatedByCezar && isSignalTerminationExit(exitCode)) {
        onEvent?.({
          type: 'note',
          message: `cursor agent terminated by cezar (code ${exitCode})`,
        });
        onEvent?.({ type: 'done' });
        return { text, toolCalls, tokensUsed: 0, sessionId };
      }

      if (exitCode !== 0 && exitCode !== null) {
        const stderr = stderrChunks.join('').trim();
        const detail = stderr ? ` — ${stderr.split('\n').slice(-3).join(' | ')}` : '';
        const msg = `cursor agent exited with code ${exitCode}${detail}`;
        onEvent?.({ type: 'error', message: msg });
        throw new Error(msg);
      }

      onEvent?.({ type: 'done' });
      return { text, toolCalls, tokensUsed: 0, sessionId };
    })();

    child.stderr.on('data', (buf: Buffer) => {
      stderrChunks.push(buf.toString('utf8'));
    });

    const interrupt = () => {
      terminatedByCezar = true;
      open = false;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    };

    const session: AgentSession = {
      result,
      pid: child.pid,
      sendMessage(_content: ContentBlock[]): boolean {
        onEvent?.({
          type: 'note',
          message:
            'Cursor print mode is one-shot in v1 — Continue starts a fresh session instead of resuming.',
        });
        return false;
      },
      end() {
        interrupt();
      },
      interrupt,
      get open() {
        return open;
      },
    };

    this.lastSession = session;
    return session;
  }
}
