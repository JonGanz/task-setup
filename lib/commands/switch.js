import { loadConfig } from '../config.js';
import { loadState, saveState } from '../state.js';
import { listTaskDirs } from '../task-dir.js';
import { askSelect } from '../prompt.js';
import { stopAll } from './stop.js';
import { runRun } from './run.js';

export async function runSwitch(argv) {
  let taskName = argv[0];
  if (!taskName) {
    const config = loadConfig();
    const dirs = listTaskDirs(config);
    if (!dirs.length) throw new Error(`No task directories found under ${config.workDir}.`);
    taskName = (await askSelect('Switch to:', dirs.map(name => ({ name })))).name;
  }

  const state = loadState();
  if (state.activeTask && state.windows.length) {
    console.log(`Stopping active task "${state.activeTask}"...`);
    await stopAll(state);
    saveState(state);
  }

  return runRun([taskName]);
}
