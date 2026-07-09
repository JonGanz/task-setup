import { lstatSync, readdirSync, readlinkSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';

import { loadConfig } from '../config.js';
import { loadState, saveState } from '../state.js';
import { listTaskDirs, resolveTaskDir } from '../task-dir.js';
import { askSelect, askConfirm } from '../prompt.js';
import { stopAll } from './stop.js';
import { untrustDirectory } from '../claude.js';

export async function runDelete(argv) {
  const config = loadConfig();

  let taskName = argv[0];
  if (!taskName) {
    const dirs = listTaskDirs(config);
    if (!dirs.length) throw new Error(`No task directories found under ${config.workDir}.`);
    taskName = (await askSelect('Delete task:', dirs.map(name => ({ name })))).name;
  }

  const taskDir = resolveTaskDir(config, taskName);

  const state = loadState();
  if (state.activeTask === taskName && state.windows.length) {
    const confirmed = await askConfirm(`"${taskName}" has running apps. Stop them and delete?`);
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
    console.log(`Stopping active task "${taskName}"...`);
    await stopAll(state);
    state.activeTask = null;
    saveState(state);
  }

  // Repos cloned via windowsBacked are symlinks into a real dir elsewhere (e.g.
  // /mnt/c/...); removing taskDir alone would only unlink the symlink and leak
  // the real checkout, so clean those up explicitly first.
  for (const entry of readdirSync(taskDir)) {
    const entryPath = join(taskDir, entry);
    if (lstatSync(entryPath).isSymbolicLink()) {
      const realTarget = resolve(taskDir, readlinkSync(entryPath));
      spawnSync('chmod', ['-R', 'u+w', realTarget]);
      rmSync(realTarget, { recursive: true, force: true });
    }
  }

  // git clone marks .git/objects/pack/*.pack and *.idx read-only; clear that
  // before removing so the delete doesn't trip permission checks.
  spawnSync('chmod', ['-R', 'u+w', taskDir]);
  rmSync(taskDir, { recursive: true, force: true });
  untrustDirectory(taskDir);

  console.log(`Deleted ${taskDir}`);
}
