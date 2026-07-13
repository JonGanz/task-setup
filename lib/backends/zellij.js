import { spawnSync } from 'child_process';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

import { shellQuote } from '../shell.js';

export const SESSION_NAME = 'task-run';

function action(args, opts) {
  return spawnSync('zellij', ['--session', SESSION_NAME, 'action', ...args], opts);
}

export function isInside() {
  return Boolean(process.env.ZELLIJ);
}

// The pane this process was launched from. Unlike zellij's default focus
// target — which resolves to whatever pane the client has focused *right
// now* — this stays pinned to our pane even if the user switches tabs while
// a slow clone runs in the background.
export function currentPane() {
  return process.env.ZELLIJ_PANE_ID;
}

// Sends commandLine (already escaped by the caller) into `pane`, followed by
// Enter. `pane` should be the pane this process started in (see
// currentPane()), same reasoning as tmux's send-keys pane pinning.
// Soft-fails on error since this is a nice-to-have that must never abort an
// otherwise-successful command.
function sendKeys(commandLine, pane) {
  const target = pane ? ['--pane-id', pane] : [];
  const write = spawnSync('zellij', ['action', 'write-chars', ...target, commandLine], { stdio: 'inherit' });
  if (write.status !== 0) {
    console.log('  (zellij write-chars failed — pane was not moved)');
    return;
  }
  spawnSync('zellij', ['action', 'send-keys', ...target, 'Enter'], { stdio: 'inherit' });
}

// Renames the currently focused tab, then sends commandLine into `pane`.
// zellij's `rename-tab` has no per-pane targeting (only --tab-id, which we
// don't have a handle on here) — it always renames whichever tab currently
// has focus, unlike sendKeys() above which is explicitly pane-pinned.
export function renameAndRun(windowName, commandLine, pane) {
  const rename = spawnSync('zellij', ['action', 'rename-tab', windowName], { stdio: 'inherit' });
  if (rename.status !== 0) {
    console.log('  (zellij rename-tab failed, continuing without it)');
  }

  sendKeys(commandLine, pane);
}

export function ensureSession() {
  if (listWindows().length || sessionExists()) return;
  spawnSync('zellij', ['attach', '--create-background', SESSION_NAME]);
}

function sessionExists() {
  const result = spawnSync('zellij', ['list-sessions'], { encoding: 'utf8' });
  if (result.status !== 0) return false;
  return result.stdout
    .split('\n')
    .some(line => line.trim().startsWith(SESSION_NAME) && !line.includes('EXITED'));
}

// zellij has no single call that creates a window and runs a command in it
// the way `tmux new-window <cmd>` does — it's a named tab, then a pane
// inside that tab running the command. Log capture is baked into the
// spawned command itself (via `tee`) since zellij has no pipe-pane
// equivalent — `zellij action pipe` is a plugin-payload pipe, not a tap on a
// pane's output.
export function createWindow(windowName, commandStr, cwd, logFile) {
  mkdirSync(dirname(logFile), { recursive: true });

  const newTab = action(['new-tab', '--name', windowName], { encoding: 'utf8' });
  const tabId = newTab.stdout.trim();

  const wrapped = `${commandStr} 2>&1 | tee -a ${shellQuote(logFile)}`;
  action(['new-pane', '--tab-id', tabId, '--cwd', cwd, '--', 'sh', '-c', wrapped]);
}

export function listWindows() {
  const result = action(['list-tabs', '--json'], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  try {
    const tabs = JSON.parse(result.stdout);
    return tabs.map(t => t.name);
  } catch {
    return [];
  }
}

export function windowExists(windowName) {
  return listWindows().includes(windowName);
}

// zellij's `list-panes --json` doesn't expose an OS pid for a pane's running
// process (no `pid`/`terminal_pid` field) — only tmux can report this, so
// callers must tolerate `undefined` here (status.js already does).
export function getWindowPid() {
  return undefined;
}

// Mirrors tmux's popup trick: a floating pane running a nested `zellij
// attach` is the closest zellij equivalent to `tmux display-popup -E
// "tmux attach-session ..."`. Detaching from the nested client (same detach
// key as the outer session, since it's the same zellij install) closes the
// floating pane and drops back to wherever the caller was.
//
// Known gap vs. tmux: outside zellij there's no "focus this tab before
// attaching" equivalent to tmux's select-window, so the attach lands on
// whichever tab was last focused rather than `windowName`.
export function attachOrSwitch(windowName, popupTitle = windowName) {
  if (isInside() && !process.env.TASK_SETUP_SKIP_POPUP) {
    spawnSync(
      'zellij',
      ['action', 'new-pane', '--floating', '--name', popupTitle, '--', 'zellij', 'attach', SESSION_NAME],
      { stdio: 'inherit' }
    );
  } else {
    spawnSync('zellij', ['attach', SESSION_NAME], { stdio: 'inherit' });
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

function tabIdFor(windowName) {
  const result = action(['list-tabs', '--json'], { encoding: 'utf8' });
  if (result.status !== 0) return undefined;
  try {
    const tabs = JSON.parse(result.stdout);
    return tabs.find(t => t.name === windowName)?.id;
  } catch {
    return undefined;
  }
}

// The (non-plugin) pane id living in tab `tabId`, so Ctrl-C can target it
// directly rather than relying on zellij's focus-based default target.
function paneIdInTab(tabId) {
  const result = action(['list-panes', '--json'], { encoding: 'utf8' });
  if (result.status !== 0) return undefined;
  try {
    const panes = JSON.parse(result.stdout);
    return panes.find(p => p.tab_id === tabId && !p.is_plugin)?.id;
  } catch {
    return undefined;
  }
}

// Graceful stop: Ctrl-C targets the tab's pane directly (via its captured
// pane id) so it lands there regardless of what's currently focused, same
// reasoning as sendKeys(). Unlike tmux, zellij's CLI exposes no OS pid for a
// pane's process, so there's no SIGTERM/SIGKILL escalation step available —
// this goes straight from a graceful Ctrl-C to a hard `close-tab` backstop.
export function stopWindow(windowName, { timeoutMs = 8000, pollIntervalMs = 300 } = {}) {
  if (!windowExists(windowName)) return { stopped: true, alreadyGone: true };

  const tabId = tabIdFor(windowName);
  const paneId = tabId !== undefined ? paneIdInTab(tabId) : undefined;
  const target = paneId !== undefined ? ['--pane-id', String(paneId)] : [];

  action(['send-keys', ...target, 'Ctrl c']);
  if (pollUntilGone(windowName, timeoutMs, pollIntervalMs)) return { stopped: true };

  if (tabId !== undefined) action(['close-tab-by-id', String(tabId)]);
  return { stopped: true, forced: true };
}
