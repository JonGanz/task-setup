import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export function listTaskDirs(config) {
  if (!existsSync(config.workDir)) return [];
  return readdirSync(config.workDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

export function resolveTaskDir(config, taskName) {
  const dir = join(config.workDir, taskName);
  if (!existsSync(dir)) throw new Error(`Task directory not found: ${dir}`);
  return dir;
}

export function reposInTaskDir(taskDir) {
  return readdirSync(taskDir, { withFileTypes: true })
    // d.isDirectory() reflects the entry's own type, not the symlink target, so
    // windowsBacked repos (symlinked into the task dir) need statSync to follow the link.
    .filter(d => statSync(join(taskDir, d.name)).isDirectory() && existsSync(join(taskDir, d.name, '.git')))
    .map(d => d.name)
    .sort();
}
