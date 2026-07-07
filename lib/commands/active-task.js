import { loadState } from '../state.js';

// Hidden command (not in the interactive picker) for shelling out from
// tmux.conf: `display-popup -T "#(task-setup active-task) — attach"` needs
// the active task's name before the popup exists to compute its title, since
// a popup's title can't be changed after it's opened.
export async function runActiveTask() {
  const state = loadState();
  console.log(state.activeTask ?? '');
}
