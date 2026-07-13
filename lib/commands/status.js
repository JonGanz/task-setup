import { loadConfig } from '../config.js';
import { loadState, saveState, removeWindow } from '../state.js';
import { getMultiplexer } from '../multiplexer.js';

function isPidAlive(pid) {
  if (!pid) return true; // no pid recorded — trust the window's existence alone
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function runStatus() {
  const state = loadState();
  if (!state.activeTask || !state.windows.length) {
    console.log('No active task / nothing running.');
    return;
  }

  const mux = getMultiplexer(loadConfig().multiplexer);
  const live = new Set(mux.listWindows());
  console.log(`Active task: ${state.activeTask}\n`);

  let anyDead = false;
  for (const w of state.windows) {
    const alive = live.has(w.windowName) && isPidAlive(w.pid);
    if (!alive) anyDead = true;
    console.log(`  ${w.windowName.padEnd(24)} ${alive ? 'running' : 'DEAD   '}  ${w.command}`);
  }

  if (anyDead) {
    removeWindow(state, w => !(live.has(w.windowName) && isPidAlive(w.pid)));
    if (!state.windows.length) state.activeTask = null;
    saveState(state);
    console.log('\n(pruned dead entries from state)');
  }
}
