import { existsSync, mkdirSync, readlinkSync, rmSync, symlinkSync, unlinkSync, lstatSync } from 'fs';
import { basename, join, resolve } from 'path';
import { spawnSync } from 'child_process';

import { loadConfig } from '../config.js';
import { loadState, saveState, removeWindow } from '../state.js';
import { listTaskDirs, resolveTaskDir, reposInTaskDir } from '../task-dir.js';
import { askSelect, askConfirm, askMultiSelect, closePrompts } from '../prompt.js';
import { applyPatch, shallowClone, getLatestSemverTag } from '../git.js';
import { hashPackageLock, ensureCache, linkNodeModules } from '../cache.js';
import { ensureWinCache } from '../win-cache.js';
import { listPatches } from '../patches.js';
import { stopWindow } from '../tmux-run.js';

export async function runEdit(argv) {
  const config = loadConfig();

  let taskName = argv[0];
  if (!taskName) {
    const dirs = listTaskDirs(config);
    if (!dirs.length) throw new Error(`No task directories found under ${config.workDir}.`);
    taskName = (await askSelect('Edit task:', dirs.map(name => ({ name })))).name;
  }

  const taskDir = resolveTaskDir(config, taskName);

  const currentRepoNames = new Set(reposInTaskDir(taskDir));
  // initialValues must be the same object references as the options passed to
  // askMultiSelect, since @clack/prompts compares selections by identity.
  const initialValues = config.repos.filter(r => currentRepoNames.has(r.name));

  const selectedRepos = await askMultiSelect('Select repos:', config.repos, {
    required: false,
    initialValues,
  });
  const selectedNames = new Set(selectedRepos.map(r => r.name));

  const toAdd = selectedRepos.filter(r => !currentRepoNames.has(r.name));
  const toRemove = [...currentRepoNames].filter(name => !selectedNames.has(name));

  if (!toAdd.length && !toRemove.length) {
    console.log('No changes.');
    return;
  }

  const isHotfix = toAdd.length ? await askConfirm('Hotfix?') : false;

  // Offer each new repo's available local dev patches, pre-checked, one prompt per
  // repo that actually has any (mirrors new.js).
  const selectedPatches = new Map();
  for (const repo of toAdd) {
    const patchChoices = listPatches(repo.name).map(path => ({ name: basename(path), path }));
    if (!patchChoices.length) continue;

    const chosen = await askMultiSelect(`Patches to apply for ${repo.name}:`, patchChoices, {
      required: false,
      initialValues: patchChoices,
    });
    selectedPatches.set(repo.name, chosen);
  }

  // Confirm removal of any repo with uncommitted changes before touching stdin.
  const confirmedRemove = [];
  for (const name of toRemove) {
    const repoDir = join(taskDir, name);
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: repoDir, encoding: 'utf8' });
    if (status.stdout.trim()) {
      const confirmed = await askConfirm(`"${name}" has uncommitted changes. Remove anyway?`);
      if (!confirmed) {
        console.log(`  skipping removal of ${name} (uncommitted changes kept)`);
        continue;
      }
    }
    confirmedRemove.push(name);
  }

  closePrompts();

  const state = loadState();
  let stateChanged = false;
  for (const name of confirmedRemove) {
    if (state.activeTask === taskName) {
      const matches = state.windows.filter(w => w.repo === name);
      for (const win of matches) {
        console.log(`Stopping ${win.windowName}...`);
        const result = stopWindow(win.windowName);
        console.log(result.forced ? `  force-killed ${win.windowName}` : `  stopped ${win.windowName}`);
        stateChanged = true;
      }
      if (matches.length) removeWindow(state, w => w.repo === name);
    }

    const repoDir = join(taskDir, name);
    if (lstatSync(repoDir).isSymbolicLink()) {
      const realTarget = resolve(taskDir, readlinkSync(repoDir));
      spawnSync('chmod', ['-R', 'u+w', realTarget]);
      rmSync(realTarget, { recursive: true, force: true });
      unlinkSync(repoDir);
    } else {
      spawnSync('chmod', ['-R', 'u+w', repoDir]);
      rmSync(repoDir, { recursive: true, force: true });
    }
    console.log(`Removed ${name}`);
  }
  if (stateChanged) {
    if (!state.windows.length) state.activeTask = null;
    saveState(state);
  }

  for (const repo of toAdd) {
    let ref;
    if (isHotfix) {
      process.stdout.write(`\nResolving latest tag for ${repo.name}... `);
      ref = getLatestSemverTag(repo.url, repo.hotfixTagPattern);
      console.log(ref);
    } else {
      ref = repo.mainBranch;
      console.log(`\nCloning ${repo.name} @ ${ref}`);
    }

    const repoDir = join(taskDir, repo.name);
    if (repo.windowsBacked) {
      const winRepoDir = join(config.winWorkDir, `${basename(taskDir)}-${repo.name}`);
      mkdirSync(winRepoDir, { recursive: true });
      shallowClone(repo.url, ref, winRepoDir);
      symlinkSync(winRepoDir, repoDir, 'dir');
    } else {
      shallowClone(repo.url, ref, repoDir);
    }

    for (const patch of selectedPatches.get(repo.name) ?? []) {
      try {
        applyPatch(repoDir, patch.path);
        console.log(`  applied patch: ${patch.name}`);
      } catch (e) {
        console.warn(`  WARNING: failed to apply patch "${patch.name}" for ${repo.name}: ${e.message}`);
      }
    }

    const lockFile = join(repoDir, 'package-lock.json');
    if (existsSync(lockFile)) {
      const hash = hashPackageLock(lockFile);
      const cacheDir = repo.npmInstallOn === 'windows'
        ? await ensureWinCache(hash, repoDir, config.winWorkDir)
        : ensureCache(hash, repoDir);
      linkNodeModules(repoDir, cacheDir);
    }

    console.log(`Added ${repo.name}`);
  }

  console.log(`\nDone. Working directory: ${taskDir}`);
}
