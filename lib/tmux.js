import { spawnSync } from 'child_process';

// Builds the tmux window name from the task description, prefixed with the
// ticket's number segment (the part after the first hyphen) when a ticket is
// given, e.g. description "AGL leaderboard" + ticket "DEV-10224" -> "10224-agl-leaderboard".
// Either input may be blank (caller enforces that at least one is present).
export function buildWindowName(description, ticket) {
  const slug = description ? toKebabCase(description) : '';
  const ticketNumber = ticket ? (ticket.split('-')[1] ?? ticket) : '';

  if (ticketNumber && slug) return `${ticketNumber}-${slug}`;
  return ticketNumber || slug;
}

export function isInsideTmux() {
  return Boolean(process.env.TMUX);
}

// The pane this process was launched from. Unlike tmux's default "current"
// target — which resolves to whatever window the client has focused *right
// now* — this stays pinned to our pane even if the user switches windows
// while a slow clone runs in the background.
export function currentPane() {
  return process.env.TMUX_PANE;
}

// Wraps a string in single quotes for safe embedding in a shell command
// string, escaping any embedded single quotes (POSIX '\'' technique).
export function shellQuote(str) {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

// Renames the window containing `pane` and sends commandLine (already
// escaped by the caller) into that pane. `pane` should be the pane this
// process started in (see currentPane()) so setup lands there even if the
// user has since switched to a different window — without it, tmux's
// default "current" target follows whatever window the client is currently
// looking at. Soft-fails on error since this is a nice-to-have that must
// never abort an otherwise-successful setup.
export function tmuxRenameAndRun(windowName, commandLine, pane) {
  const target = pane ? ['-t', pane] : [];

  const rename = spawnSync('tmux', ['rename-window', ...target, windowName], { stdio: 'inherit' });
  if (rename.status !== 0) {
    console.log('  (tmux rename-window failed, continuing without it)');
  }

  const sendKeys = spawnSync('tmux', ['send-keys', ...target, commandLine, 'Enter'], { stdio: 'inherit' });
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
