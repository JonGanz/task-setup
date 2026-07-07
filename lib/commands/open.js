import { loadConfig } from '../config.js';
import { listTaskDirs, resolveTaskDir } from '../task-dir.js';
import { askSelect, closePrompts } from '../prompt.js';
import { currentPane, isInsideTmux, shellQuote, tmuxRenameAndRun } from '../tmux.js';
import { runRun } from './run.js';
import { runSwitch } from './switch.js';

export async function runOpen(argv) {
  const config = loadConfig();

  // Capture the pane we started in now, before any prompt or long-running
  // step gives the user a chance to switch tmux windows.
  const pane = currentPane();

  let taskName = argv[0];
  if (!taskName) {
    const dirs = listTaskDirs(config);
    if (!dirs.length) throw new Error(`No task directories found under ${config.workDir}.`);
    taskName = (await askSelect('Open task:', dirs.map(name => ({ name })))).name;
  }

  const taskDir = resolveTaskDir(config, taskName);

  if (!isInsideTmux()) {
    console.log(`(not running inside tmux — can't cd your shell; task directory is ${taskDir})`);
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

  tmuxRenameAndRun(taskName, `cd ${shellQuote(taskDir)} && clear`, pane);
}
