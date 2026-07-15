import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

// Cache lives under winWorkDir (drvfs), not ~/.cache — installs run via
// powershell.exe, whose cwd must resolve to a real Windows path, same as the
// windowsBacked clone dir itself (see commands/new.js).
function winCacheBase(winWorkDir) {
  return join(winWorkDir, '.npm-cache', 'node_modules');
}

const NPM_CI_TIMEOUT_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;

// spawnSync + stdio: 'inherit' waits for the inherited stdio handles to close,
// not just for the process to exit. Over WSL interop, anything npm spawns on
// the Windows side (postinstall scripts, background helpers) can hold that
// handle open past powershell.exe's own exit, hanging forever even though the
// install already finished. Using async spawn and resolving on 'exit' (not
// 'close') sidesteps that — we don't wait on the stdio streams at all.
//
// npm ci can still hang after that even so: it runs an update-notifier check
// against the registry right before exiting, and env vars set via spawn()'s
// `env` option don't cross the WSL-interop boundary into the Windows process
// (WSL only forwards vars whitelisted in WSLENV), so the override has to be
// set inside the PowerShell command itself. A timeout + kill is kept as a
// backstop for any other cause of the same symptom — `child.kill()` reaches
// the real Windows process via interop even though `child.pid` is a WSL-side
// id with no relation to the Windows PID (so a taskkill.exe-by-pid approach
// would not work here).
function runNpmCi(cacheDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-Command',
      "$env:npm_config_update_notifier='false'; npm ci",
    ], {
      cwd: cacheDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    // npm ci can go quiet for minutes with zero output (Windows Defender scanning
    // every file it writes, or a package's postinstall pulling down a platform
    // binary) — without this it's indistinguishable from an actual hang.
    const startedAt = Date.now();
    const heartbeat = setInterval(() => {
      console.log(`  → still running npm ci via powershell.exe... (${Math.round((Date.now() - startedAt) / 1000)}s elapsed)`);
    }, HEARTBEAT_MS);

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(
        `npm ci (via powershell.exe) timed out after ${NPM_CI_TIMEOUT_MS / 60000} minutes in ${cacheDir} — ` +
        `check Windows-side npm/network config (proxy, registry, update-notifier)`
      ));
    }, NPM_CI_TIMEOUT_MS);

    child.on('error', e => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      reject(new Error(`Failed to invoke powershell.exe (is WSL interop enabled?): ${e.message}`));
    });
    child.on('exit', code => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      resolve(code);
    });
  });
}

// Like cache.js's ensureCache, but installs are done by npm running on native
// Windows (via WSL interop) instead of WSL's npm, so platform-specific
// optionalDependencies (e.g. a Tauri CLI's native binary) resolve to the
// Windows build instead of Linux.
export async function ensureWinCache(hash, repoDir, winWorkDir) {
  const cacheDir = join(winCacheBase(winWorkDir), hash);
  const cacheModules = join(cacheDir, 'node_modules');

  if (existsSync(cacheModules)) {
    console.log(`  → Windows cache hit  [${hash}]`);
    return cacheDir;
  }

  console.log(`  → Windows cache miss [${hash}], running npm ci via powershell.exe...`);
  mkdirSync(cacheDir, { recursive: true });
  copyFileSync(join(repoDir, 'package.json'), join(cacheDir, 'package.json'));
  copyFileSync(join(repoDir, 'package-lock.json'), join(cacheDir, 'package-lock.json'));

  const code = await runNpmCi(cacheDir);
  if (code !== 0) {
    throw new Error(`npm ci (via powershell.exe) failed in ${cacheDir}`);
  }

  return cacheDir;
}
