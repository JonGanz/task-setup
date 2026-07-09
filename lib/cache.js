import { createHash } from 'crypto';
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
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

// Hardlinks (not symlinks) so repoDir/node_modules is a real directory whose
// resolved path stays inside the task folder — Vite's server.fs.allow check
// rejects paths that resolve outside the project root, which a top-level
// symlink into ~/.cache would trip. Files still share inodes with the cache,
// so anything that rewrites node_modules in place (patch-package, native
// rebuilds, postinstall scripts) mutates the shared cache for every task
// using that lockfile hash.
export function linkNodeModules(repoDir, cacheDir) {
  const target = join(cacheDir, 'node_modules');
  const link = join(repoDir, 'node_modules');

  if (existsSync(link)) {
    console.log(`  → node_modules already exists, skipping link`);
    return;
  }

  const result = spawnSync('cp', ['-al', target, link], { encoding: 'utf8' });
  if (result.status !== 0) {
    if (!/invalid cross-device link/i.test(result.stderr ?? '')) {
      throw new Error(`Failed to hardlink node_modules into ${repoDir}`);
    }

    // Hardlinks can't cross filesystems (e.g. cache on ext4, repo on a /mnt/c drvfs
    // mount for windowsBacked repos) — fall back to a real copy. This repo won't
    // share the inode cache, so installs are slower and use more disk.
    console.log(`  → node_modules cache is on a different filesystem, copying instead of hardlinking`);
    const copyResult = spawnSync('cp', ['-a', target, link], { encoding: 'utf8' });
    if (copyResult.status !== 0) {
      throw new Error(`Failed to copy node_modules into ${repoDir}`);
    }
  }
}
