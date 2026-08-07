import type { AgentModelSettingsStrategy } from './types.ts';

/**
 * Cursor Agent CLI has no project/user settings files cezar manages yet
 * (Settings → Agents → Cursor groups are empty). Native model defaults are
 * therefore always unset — the runner decides, or a Cezar preset applies.
 */
export const cursorModelSettingsStrategy: AgentModelSettingsStrategy = {
  runner: 'cursor',
  async read() {
    return {};
  },
};
