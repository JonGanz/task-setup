import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { CONFIG_DIR } from './config.js';

export const STATE_PATH = join(CONFIG_DIR, 'run-state.json');
export const SESSION_NAME = 'task-run';

function defaultState() {
  return { activeTask: null, session: SESSION_NAME, windows: [] };
}

export function loadState() {
  if (!existsSync(STATE_PATH)) return defaultState();

  try {
    const raw = readFileSync(STATE_PATH, 'utf8');
    const state = JSON.parse(raw);
    return {
      activeTask: state.activeTask ?? null,
      session: state.session ?? SESSION_NAME,
      windows: Array.isArray(state.windows) ? state.windows : [],
    };
  } catch (e) {
    console.log(`  (run-state.json is corrupt, resetting: ${e.message})`);
    return defaultState();
  }
}

export function saveState(state) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function addWindow(state, record) {
  state.windows.push(record);
}

export function removeWindow(state, predicate) {
  state.windows = state.windows.filter(w => !predicate(w));
}
