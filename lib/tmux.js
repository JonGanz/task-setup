import { spawnSync } from 'child_process';

// Builds the tmux window name from the task description, prefixed with the
// ticket's number segment (the part after the first hyphen) when a ticket is
// given, e.g. description "AGL leaderboard" + ticket "DEV-10224" -> "10224-agl-leaderboard".
export function buildWindowName(description, ticket) {
  const slug = toKebabCase(description);
  if (!ticket) return slug;

  const ticketNumber = ticket.split('-')[1] ?? ticket;
  return `${ticketNumber}-${slug}`;
}

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

function toKebabCase(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
