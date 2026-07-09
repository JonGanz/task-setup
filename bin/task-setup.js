#!/usr/bin/env node
const [, , cmd, ...rest] = process.argv;

const COMMANDS = {
  new: () => import('../lib/commands/new.js').then(m => m.runNew),
  run: () => import('../lib/commands/run.js').then(m => m.runRun),
  switch: () => import('../lib/commands/switch.js').then(m => m.runSwitch),
  open: () => import('../lib/commands/open.js').then(m => m.runOpen),
  status: () => import('../lib/commands/status.js').then(m => m.runStatus),
  attach: () => import('../lib/commands/attach.js').then(m => m.runAttach),
  stop: () => import('../lib/commands/stop.js').then(m => m.runStop),
  delete: () => import('../lib/commands/delete.js').then(m => m.runDelete),
  'active-task': () => import('../lib/commands/active-task.js').then(m => m.runActiveTask),
};

const COMMAND_DESCRIPTIONS = [
  { cmd: 'new', label: 'new — bootstrap a new task\'s working directory' },
  { cmd: 'run', label: 'run — start apps for a task' },
  { cmd: 'switch', label: 'switch — stop the active task\'s apps, start another\'s' },
  { cmd: 'open', label: 'open — cd into a task\'s directory in the current window' },
  { cmd: 'status', label: 'status — list running apps and their liveness' },
  { cmd: 'attach', label: 'attach — jump into a running app\'s window/REPL' },
  { cmd: 'stop', label: 'stop — stop running apps' },
  { cmd: 'delete', label: 'delete — remove a task\'s working directory' },
];

async function dispatch() {
  let command = cmd;

  if (command === undefined) {
    const { askSelect } = await import('../lib/prompt.js');
    const choice = await askSelect(
      'Command:',
      COMMAND_DESCRIPTIONS.map(d => ({ name: d.label, cmd: d.cmd }))
    );
    command = choice.cmd;
  } else if (!(command in COMMANDS)) {
    throw new Error(`Unknown command "${command}". Run "task-setup" with no arguments to pick one.\nAvailable: ${Object.keys(COMMANDS).join(', ')}`);
  }

  const run = await COMMANDS[command]();
  return run(rest);
}

dispatch().catch(err => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
