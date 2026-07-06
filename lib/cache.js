import { createHash } from 'crypto';
import { readFileSync, existsSync, mkdirSync, copyFileSync, symlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';

const CACHE_BASE = join(homedir(), '.cache', 'task-setup', 'node_modules');

export function hashPackageLock(filePath) {
  const contents = readFileSync(filePath);
  return createHash('sha256').update(contents).digest('hex').slice(0, 16);
}

// Returns the cache directory for the given hash, creating and populating it if needed.
export function ensureCache(hash, repoDir) {
  const cacheDir = join(CACHE_BASE, hash);
  const cacheModules = join(cacheDir, 'node_modules');

  if (existsSync(cacheModules)) {
    console.log(`  → Cache hit  [${hash}]`);
    return cacheDir;
  }

  console.log(`  → Cache miss [${hash}], running npm ci...`);
  mkdirSync(cacheDir, { recursive: true });
  copyFileSync(join(repoDir, 'package.json'), join(cacheDir, 'package.json'));
  copyFileSync(join(repoDir, 'package-lock.json'), join(cacheDir, 'package-lock.json'));

  const result = spawnSync('npm', ['ci'], { cwd: cacheDir, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`npm ci failed in ${cacheDir}`);
  }

  return cacheDir;
}

export function symlinkNodeModules(repoDir, cacheDir) {
  const target = join(cacheDir, 'node_modules');
  const link = join(repoDir, 'node_modules');

  if (existsSync(link)) {
    console.log(`  → node_modules already exists, skipping symlink`);
    return;
  }

  symlinkSync(target, link);
}
