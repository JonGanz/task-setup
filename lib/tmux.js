import { spawnSync } from 'child_process';

export function isInsideTmux() {
  return Boolean(process.env.TMUX);
}

// Wraps a string in single quotes for safe embedding in a shell command
// string, escaping any embedded single quotes (POSIX '\'' technique).
export function shellQuote(str) {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

// Renames the current tmux window and sends commandLine (already escaped by
// the caller) into the active pane. Soft-fails on error since this is a
// nice-to-have that must never abort an otherwise-successful setup.
export function tmuxRenameAndRun(windowName, commandLine) {
  const rename = spawnSync('tmux', ['rename-window', windowName], { stdio: 'inherit' });
  if (rename.status !== 0) {
    console.log('  (tmux rename-window failed, continuing without it)');
  }

  const sendKeys = spawnSync('tmux', ['send-keys', commandLine, 'Enter'], { stdio: 'inherit' });
  if (sendKeys.status !== 0) {
    console.log('  (tmux send-keys failed — pane was not moved)');
  }
}
