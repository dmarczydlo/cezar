/**
 * Map Cursor `agent -p --output-format stream-json` NDJSON lines → AgentEvent.
 * Unknown shapes are ignored — never throw into the run manager.
 */

import type { AgentEvent } from '../../../core/agent-runner.ts';

function toolNameFromCall(toolCall: unknown): string {
  if (!toolCall || typeof toolCall !== 'object') return 'tool';
  const obj = toolCall as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key.endsWith('ToolCall') || key === 'function') {
      const name = key.replace(/ToolCall$/, '');
      if (key === 'function') {
        const fn = obj.function as { name?: unknown } | undefined;
        return typeof fn?.name === 'string' ? fn.name : 'function';
      }
      return name || 'tool';
    }
  }
  return 'tool';
}

function toolInputFromCall(toolCall: unknown): unknown {
  if (!toolCall || typeof toolCall !== 'object') return {};
  const obj = toolCall as Record<string, unknown>;
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && 'args' in (value as object)) {
      return (value as { args?: unknown }).args ?? {};
    }
  }
  return obj;
}

function assistantText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string' && text) parts.push(text);
    }
  }
  return parts.join('');
}

/**
 * Convert one Cursor stream-json object into zero or more AgentEvents.
 * With default (non-partial) stream-json, every assistant event is used.
 */
export function mapCursorStreamEvent(raw: unknown): AgentEvent[] {
  if (!raw || typeof raw !== 'object') return [];
  const ev = raw as Record<string, unknown>;
  const type = ev.type;

  try {
    if (type === 'system' && ev.subtype === 'init' && typeof ev.session_id === 'string') {
      return [{ type: 'session', sessionId: ev.session_id }];
    }

    if (type === 'assistant') {
      // Skip duplicate flushes when --stream-partial-output is used.
      if ('model_call_id' in ev) return [];
      if (!('timestamp_ms' in ev) && 'model_call_id' in ev === false) {
        // Final flush without timestamp — only skip when we already saw deltas.
        // Without partial streaming, assistant events have neither field → keep.
      }
      const text = assistantText(ev.message);
      return text ? [{ type: 'text', text }] : [];
    }

    if (type === 'tool_call') {
      const callId = typeof ev.call_id === 'string' ? ev.call_id : `cursor-${Date.now()}`;
      if (ev.subtype === 'started') {
        return [
          {
            type: 'tool-call',
            id: callId,
            tool: toolNameFromCall(ev.tool_call),
            input: toolInputFromCall(ev.tool_call),
          },
        ];
      }
      if (ev.subtype === 'completed') {
        return [
          {
            type: 'tool-result',
            toolCallId: callId,
            result: JSON.stringify(ev.tool_call ?? {}),
            isError: false,
          },
        ];
      }
      return [];
    }

    if (type === 'result') {
      const events: AgentEvent[] = [];
      if (typeof ev.session_id === 'string') {
        events.push({ type: 'session', sessionId: ev.session_id });
      }
      if (ev.is_error === true) {
        const msg =
          typeof ev.result === 'string' && ev.result
            ? ev.result
            : 'Cursor agent reported an error';
        events.push({ type: 'error', message: msg });
      } else if (typeof ev.result === 'string' && ev.result && ev.subtype === 'success') {
        // Full concatenated result — may duplicate assistant texts; still useful when
        // no assistant events were emitted.
        // Prefer not re-emitting duplicate walls of text: only emit done.
      }
      events.push({ type: 'done' });
      return events;
    }

    return [];
  } catch {
    return [];
  }
}
