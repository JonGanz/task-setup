import { spawnSync } from 'child_process';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

import { isInsideTmux, shellQuote } from './tmux.js';

export const SESSION_NAME = 'task-run';
const PLACEHOLDER_WINDOW = '_placeholder';

// tmux kills a session when its last window closes, and every real window
// here runs a single foreground command that exits when stopped. A permanent
// placeholder window keeps the session alive across full stop/start cycles.
export function ensureSession() {
  const has = spawnSync('tmux', ['has-session', '-t', SESSION_NAME]);
  if (has.status !== 0) {
    spawnSync('tmux', ['new-session', '-d', '-s', SESSION_NAME, '-n', PLACEHOLDER_WINDOW]);
  }
}

export function createWindow(windowName, commandStr, cwd) {
  spawnSync('tmux', ['new-window', '-d', '-t', SESSION_NAME, '-n', windowName, '-c', cwd, commandStr]);
}

export function listWindows() {
  const result = spawnSync('tmux', ['list-windows', '-t', SESSION_NAME, '-F', '#{window_name}'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return result.stdout.trim().split('\n').filter(Boolean);
}

export function windowExists(windowName) {
  return listWindows().includes(windowName);
}

export function getWindowPid(windowName) {
  const result = spawnSync('tmux', ['list-panes', '-t', `${SESSION_NAME}:${windowName}`, '-F', '#{pane_pid}'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return undefined;
  const pid = parseInt(result.stdout.trim(), 10);
  return Number.isNaN(pid) ? undefined : pid;
}

export function pipePane(windowName, logFile) {
  mkdirSync(dirname(logFile), { recursive: true });
  spawnSync('tmux', ['pipe-pane', '-o', '-t', `${SESSION_NAME}:${windowName}`, `cat >> ${shellQuote(logFile)}`]);
}

export function selectWindow(windowName) {
  spawnSync('tmux', ['select-window', '-t', `${SESSION_NAME}:${windowName}`]);
}

// Inside tmux, attaching via a popup overlay (instead of switch-client) means
// the caller's own session/window is never actually left — detaching from the
// popup (prefix-d, same as any tmux client) just closes the overlay and drops
// you back exactly where you were. Outside tmux there's no "where you were"
// to preserve, so a direct attach is fine.
//
// TASK_SETUP_SKIP_POPUP lets a caller that's already running inside its own
// popup (e.g. a tmux keybinding wrapping this command in `display-popup`)
// skip wrapping the attach in a second, redundant popup.
export function attachOrSwitch(windowName, popupTitle = windowName) {
  const target = `${SESSION_NAME}:${windowName}`;
  if (isInsideTmux() && !process.env.TASK_SETUP_SKIP_POPUP) {
    spawnSync(
      'tmux',
      ['display-popup', '-E', '-w', '90%', '-h', '90%', '-T', popupTitle, `tmux attach-session -t ${shellQuote(target)}`],
      { stdio: 'inherit' }
    );
  } else if (isInsideTmux()) {
    spawnSync('tmux', ['attach-session', '-t', target], { stdio: 'inherit' });
  } else {
    selectWindow(windowName);
    spawnSync('tmux', ['attach-session', '-t', SESSION_NAME], { stdio: 'inherit' });
  }
}

// Synchronous sleep with no extra deps — fine for a short-lived CLI script.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pollUntilGone(windowName, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!windowExists(windowName)) return true;
    sleepSync(intervalMs);
  }
  return !windowExists(windowName);
}

// Graceful stop: Ctrl-C via tmux delivers SIGINT to the whole foreground
// process group (matters for `npm run dev` chains into moleculer-runner/vite),
// then escalates to SIGTERM/SIGKILL on the captured pane pid, then a final
// kill-window as a backstop.
export function stopWindow(windowName, { timeoutMs = 8000, pollIntervalMs = 300, termTimeoutMs = 3000 } = {}) {
  if (!windowExists(windowName)) return { stopped: true, alreadyGone: true };

  const pid = getWindowPid(windowName);

  spawnSync('tmux', ['send-keys', '-t', `${SESSION_NAME}:${windowName}`, 'C-c']);
  if (pollUntilGone(windowName, timeoutMs, pollIntervalMs)) return { stopped: true };

  if (pid) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    if (pollUntilGone(windowName, termTimeoutMs, pollIntervalMs)) return { stopped: true, forced: true };
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }

  spawnSync('tmux', ['kill-window', '-t', `${SESSION_NAME}:${windowName}`]);
  return { stopped: true, forced: true };
}
