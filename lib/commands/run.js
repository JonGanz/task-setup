import { homedir } from 'os';
import { join } from 'path';

import { loadConfig } from '../config.js';
import { loadState, saveState, addWindow } from '../state.js';
import { listTaskDirs, resolveTaskDir, reposInTaskDir } from '../task-dir.js';
import { askConfirm, askMultiSelect, askSelect, closePrompts } from '../prompt.js';
import { resolveCommandString } from '../run-config.js';
import { ensureSession, createWindow, pipePane, getWindowPid, SESSION_NAME } from '../tmux-run.js';
import { stopAll } from './stop.js';

export async function runRun(argv) {
  const config = loadConfig();
  const state = loadState();

  let taskName = argv[0];
  if (!taskName) {
    const dirs = listTaskDirs(config);
    if (!dirs.length) throw new Error(`No task directories found under ${config.workDir}.`);

    if (state.activeTask && dirs.includes(state.activeTask)) {
      const resume = await askConfirm(`Resume active task "${state.activeTask}"?`);
      taskName = resume ? state.activeTask : (await askSelect('Select a task:', dirs.map(name => ({ name })))).name;
    } else {
      taskName = (await askSelect('Select a task:', dirs.map(name => ({ name })))).name;
    }
  }

  const taskDir = resolveTaskDir(config, taskName);

  if (state.activeTask && state.activeTask !== taskName && state.windows.length) {
    console.log(`Stopping active task "${state.activeTask}" first...`);
    await stopAll(state);
  }

  const presentRepos = reposInTaskDir(taskDir);
  const byName = new Map(config.repos.map(r => [r.name, r]));

  const choices = [];
  for (const repoName of presentRepos) {
    const repoConfig = byName.get(repoName);
    if (!repoConfig?.run) {
      console.log(`  (skipping ${repoName}: no "run" config)`);
      continue;
    }
    for (const [profile, cmdDef] of Object.entries(repoConfig.run.commands)) {
      choices.push({ name: `${repoName}:${profile}`, repoName, profile, cmdDef });
    }
  }
  for (const repoConfig of config.repos) {
    if (repoConfig.run && !presentRepos.includes(repoConfig.name)) {
      console.log(`  (note: ${repoConfig.name} has run config but isn't in this task)`);
    }
  }
  if (!choices.length) throw new Error('No repos with "run" config found in this task directory.');

  const alreadyRunning = new Set(state.activeTask === taskName ? state.windows.map(w => w.windowName) : []);
  const selectable = choices.filter(c => !alreadyRunning.has(c.name));
  if (!selectable.length) {
    console.log('Everything selectable is already running.');
    return;
  }

  const chosen = await askMultiSelect('Select apps to start:', selectable);
  closePrompts();

  ensureSession();
  state.activeTask = taskName;
  for (const c of chosen) {
    const windowName = c.name;
    const cwd = join(taskDir, c.repoName);
    const commandStr = resolveCommandString(c.cmdDef);
    createWindow(windowName, commandStr, cwd);

    const logFile = join(homedir(), '.cache', 'task-setup', 'logs', taskName, `${c.repoName}-${c.profile}.log`);
    pipePane(windowName, logFile);

    const pid = getWindowPid(windowName);
    addWindow(state, {
      repo: c.repoName,
      profile: c.profile,
      windowName,
      command: commandStr,
      cwd,
      repl: c.cmdDef.repl,
      pid,
      logFile,
      startedAt: new Date().toISOString(),
    });
    console.log(`  started ${windowName}`);
  }
  saveState(state);

  console.log(`\nDone. Session "${SESSION_NAME}" — "task-setup status" to check, "task-setup attach <repo>" to attach.`);
}
