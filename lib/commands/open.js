import { loadConfig } from '../config.js';
import { listTaskDirs, resolveTaskDir } from '../task-dir.js';
import { askSelect } from '../prompt.js';
import { currentPane, isInsideTmux, shellQuote, tmuxRenameAndRun } from '../tmux.js';

export async function runOpen(argv) {
  const config = loadConfig();

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

  tmuxRenameAndRun(taskName, `cd ${shellQuote(taskDir)}`, currentPane());
}
