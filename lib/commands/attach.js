import { loadConfig } from '../config.js';
import { loadState } from '../state.js';
import { askSelect } from '../prompt.js';
import { getMultiplexer } from '../multiplexer.js';

export async function runAttach(argv) {
  const mux = getMultiplexer(loadConfig().multiplexer);
  const state = loadState();
  if (!state.activeTask || !state.windows.length) throw new Error('Nothing running for the active task.');

  let arg = argv[0];
  if (!arg) {
    const choice = await askSelect(
      'Attach to:',
      state.windows.map(w => ({ name: w.windowName }))
    );
    arg = choice.name;
  }

  const [repo, profile] = arg.split(':');
  const matches = state.windows.filter(w => w.repo === repo && (!profile || w.profile === profile));
  if (!matches.length) throw new Error(`No running window for "${arg}".`);
  if (matches.length > 1) {
    throw new Error(`Ambiguous "${arg}" — running profiles: ${matches.map(m => m.profile).join(', ')}. Use ${repo}:<profile>.`);
  }

  const win = matches[0];
  if (!mux.windowExists(win.windowName)) {
    throw new Error(`"${win.windowName}" isn't actually running (stale state — run "task-setup status").`);
  }
  if (!win.repl) console.log('  (note: not marked repl-attachable — attaching to the pane anyway)');

  mux.attachOrSwitch(win.windowName, `${state.activeTask} — ${win.windowName}`);
}
