import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

import { CONFIG_DIR } from './config.js';

export function listPatches(repoName) {
  const patchDir = join(CONFIG_DIR, 'patches', repoName);
  if (!existsSync(patchDir)) return [];

  return readdirSync(patchDir)
    .filter(f => f.endsWith('.patch') || f.endsWith('.diff'))
    .sort()
    .map(f => join(patchDir, f));
}
