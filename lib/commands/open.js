import { loadConfig } from '../config.js';
import { listTaskDirs, resolveTaskDir } from '../task-dir.js';
import { askSelect, closePrompts } from '../prompt.js';
import { shellQuote } from '../shell.js';
import { getMultiplexer } from '../multiplexer.js';
import { runRun } from './run.js';
import { runSwitch } from './switch.js';

export async function runOpen(argv) {
  const config = loadConfig();
  const mux = getMultiplexer(config.multiplexer);

  // Capture the pane we started in now, before any prompt or long-running
  // step gives the user a chance to switch windows.
  const pane = mux.currentPane();

  let taskName = argv[0];
  if (!taskName) {
    const dirs = listTaskDirs(config);
    if (!dirs.length) throw new Error(`No task directories found under ${config.workDir}.`);
    taskName = (await askSelect('Open task:', dirs.map(name => ({ name })))).name;
  }

  const taskDir = resolveTaskDir(config, taskName);

  if (!mux.isInside()) {
    console.log(`(not running inside ${config.multiplexer} — can't cd your shell; task directory is ${taskDir})`);
    return;
  }

  const { action } = await askSelect('Also start this task?', [
    { name: 'No, just open', action: 'no' },
    { name: 'Run (start apps for this task)', action: 'run' },
    { name: 'Switch (stop active task, then run this one)', action: 'switch' },
  ]);

  // Done with our own prompts; run/switch have their own prompts to run
  // before anything gets sent into this pane.
  closePrompts();

  if (action === 'run') await runRun([taskName]);
  if (action === 'switch') await runSwitch([taskName]);

  mux.renameAndRun(taskName, `cd ${shellQuote(taskDir)} && clear`, pane);
}
