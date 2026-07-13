import { loadConfig } from '../config.js';
import { loadState, saveState, removeWindow } from '../state.js';
import { getMultiplexer } from '../multiplexer.js';

export async function runStop(argv) {
  const mux = getMultiplexer(loadConfig().multiplexer);
  const arg = argv[0];
  const state = loadState();
  if (!state.activeTask || !state.windows.length) {
    console.log('Nothing running.');
    return;
  }

  if (!arg) {
    await stopAll(state, mux);
    state.activeTask = null;
    saveState(state);
    console.log('Stopped all apps for the active task.');
    return;
  }

  const [repo, profile] = arg.split(':');
  const matches = state.windows.filter(w => w.repo === repo && (!profile || w.profile === profile));
  if (!matches.length) throw new Error(`No running window matches "${arg}".`);
  if (matches.length > 1) {
    throw new Error(`Ambiguous "${arg}" — profiles: ${matches.map(m => m.profile).join(', ')}.`);
  }

  const win = matches[0];
  console.log(`Stopping ${win.windowName}...`);
  const result = mux.stopWindow(win.windowName);
  removeWindow(state, w => w.windowName === win.windowName);
  if (!state.windows.length) state.activeTask = null;
  saveState(state);
  console.log(result.forced ? `  force-killed ${win.windowName}` : `  stopped ${win.windowName}`);
}

// Shared by run.js/switch.js when they need to clear out the active task
// before starting another. Mutates state.windows in place; callers save.
export async function stopAll(state, mux = getMultiplexer(loadConfig().multiplexer)) {
  for (const w of [...state.windows]) {
    console.log(`Stopping ${w.windowName}...`);
    const result = mux.stopWindow(w.windowName);
    console.log(result.forced ? `  force-killed ${w.windowName}` : `  stopped ${w.windowName}`);
  }
  state.windows = [];
}
