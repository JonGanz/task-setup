import { existsSync, readdirSync } from 'fs';
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
    .filter(d => d.isDirectory() && existsSync(join(taskDir, d.name, '.git')))
    .map(d => d.name)
    .sort();
}
