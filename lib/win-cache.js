import { existsSync, mkdirSync, copyFileSync, realpathSync } from 'fs';
import { join } from 'path';
import { spawn, spawnSync } from 'child_process';

// Cache lives under winWorkDir (drvfs), not ~/.cache — installs run via
// powershell.exe, whose cwd must resolve to a real Windows path, same as the
// windowsBacked clone dir itself (see commands/new.js).
function winCacheBase(winWorkDir) {
  return join(winWorkDir, '.npm-cache', 'node_modules');
}

const POWERSHELL_TIMEOUT_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;

// spawnSync + stdio: 'inherit' waits for the inherited stdio handles to close,
// not just for the process to exit. Over WSL interop, anything spawned on the
// Windows side (npm postinstall scripts, background helpers) can hold that
// handle open past powershell.exe's own exit, hanging forever even though the
// work already finished. Using async spawn and resolving on 'exit' (not
// 'close') sidesteps that — we don't wait on the stdio streams at all.
//
// A timeout + kill is kept as a backstop for hangs on the Windows side (e.g.
// npm ci's update-notifier check against the registry right before exiting) —
// `child.kill()` reaches the real Windows process via interop even though
// `child.pid` is a WSL-side id with no relation to the Windows PID (so a
// taskkill.exe-by-pid approach would not work here).
function runPowershell(script, { cwd, label }) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', script], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    // Can go quiet for minutes with zero output (Windows Defender scanning
    // every file it touches) — without this it's indistinguishable from a hang.
    const startedAt = Date.now();
    const heartbeat = setInterval(() => {
      console.log(`  → still running ${label} via powershell.exe... (${Math.round((Date.now() - startedAt) / 1000)}s elapsed)`);
    }, HEARTBEAT_MS);

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(
        `${label} (via powershell.exe) timed out after ${POWERSHELL_TIMEOUT_MS / 60000} minutes in ${cwd}`
      ));
    }, POWERSHELL_TIMEOUT_MS);

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

// wslpath handles mount-config edge cases (case options, custom drvfs mounts)
// that a hand-rolled /mnt/<drive>/... regex would miss.
function toWindowsPath(wslPath) {
  const result = spawnSync('wslpath', ['-w', wslPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Failed to convert "${wslPath}" to a Windows path: ${result.stderr}`);
  }
  return result.stdout.trim();
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

  const code = await runPowershell("$env:npm_config_update_notifier='false'; npm ci", { cwd: cacheDir, label: 'npm ci' });
  if (code !== 0) {
    throw new Error(`npm ci (via powershell.exe) failed in ${cacheDir}`);
  }

  return cacheDir;
}

// Like cache.js's linkNodeModules, but for windowsBacked + npmInstallOn:
// "windows" repos: source and destination both live on the same drvfs mount,
// so a Linux-side `cp -al` still works, but every file's stat/link syscall
// crosses the WSL2 9P boundary into the Windows filesystem driver — for a
// node_modules tree with tens of thousands of small files, that per-file
// round trip dominates. Doing the hardlinking as a single native Windows
// process (like npm ci above) avoids that entirely.
//
// Files still share inodes with the cache, so anything that rewrites
// node_modules in place (patch-package, native rebuilds, postinstall scripts)
// mutates the shared cache for every task using that lockfile hash.
export async function linkNodeModulesWindows(repoDir, cacheDir) {
  const link = join(repoDir, 'node_modules');

  if (existsSync(link)) {
    console.log(`  → node_modules already exists, skipping link`);
    return;
  }

  // repoDir is a symlink into winWorkDir (see commands/new.js) — resolve it
  // before converting, since its unresolved parent (workDir) is typically a
  // plain Linux path that wslpath can't translate.
  const realRepoDir = realpathSync(repoDir);
  const winSource = toWindowsPath(join(cacheDir, 'node_modules'));
  const winDest = toWindowsPath(join(realRepoDir, 'node_modules'));

  const script = `
$src = '${winSource}'
$dst = '${winDest}'
$files = [System.IO.Directory]::EnumerateFiles($src, '*', [System.IO.SearchOption]::AllDirectories)
foreach ($f in $files) {
  $rel = $f.Substring($src.Length + 1)
  $destPath = Join-Path $dst $rel
  $destDir = Split-Path $destPath -Parent
  if (-not (Test-Path -LiteralPath $destDir)) {
    [System.IO.Directory]::CreateDirectory($destDir) | Out-Null
  }
  try {
    New-Item -ItemType HardLink -Path $destPath -Target $f -ErrorAction Stop | Out-Null
  } catch {
    Copy-Item -LiteralPath $f -Destination $destPath -Force
  }
}
`;

  const code = await runPowershell(script, { cwd: realRepoDir, label: 'node_modules link' });
  if (code !== 0) {
    throw new Error(`Failed to hardlink node_modules into ${realRepoDir} (via powershell.exe)`);
  }
}
