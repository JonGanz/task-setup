import { copyFileSync, existsSync, mkdirSync, symlinkSync } from 'fs';
import { basename, join } from 'path';

import { CONFIG_DIR, loadConfig } from '../config.js';
import { askText, askConfirm, askMultiSelect, closePrompts } from '../prompt.js';
import { applyPatch, shallowClone, getLatestSemverTag } from '../git.js';
import { hashPackageLock, ensureCache, linkNodeModules } from '../cache.js';
import { listPatches } from '../patches.js';
import { buildWindowName, currentPane, isInsideTmux, shellQuote, tmuxRenameAndRun } from '../tmux.js';
import { buildClaudePrompt, launchClaude, trustDirectory } from '../claude.js';

export async function runNew(argv) {
  const config = loadConfig();

  // Capture the pane we started in now, before any prompt or long-running
  // step gives the user a chance to switch tmux windows.
  const pane = currentPane();

  let description = argv[0]?.trim();
  if (!description) description = (await askText('Task description (optional)'))?.trim();

  const ticket = (await askText('Ticket number (optional)'))?.trim();

  if (!description && !ticket) {
    throw new Error('Provide a task description or a ticket number.');
  }

  const launchClaudeConfirmed = await askConfirm('Launch Claude Code?');

  const selectedRepos = await askMultiSelect('Select repos:', config.repos);
  const isHotfix = await askConfirm('Hotfix?');

  // Offer each repo's available local dev patches, pre-checked, one prompt per
  // repo that actually has any (repos without a patches/<name> dir are skipped).
  const selectedPatches = new Map();
  for (const repo of selectedRepos) {
    const patchChoices = listPatches(repo.name).map(path => ({ name: basename(path), path }));
    if (!patchChoices.length) continue;

    const chosen = await askMultiSelect(`Patches to apply for ${repo.name}:`, patchChoices, {
      required: false,
      initialValues: patchChoices,
    });
    selectedPatches.set(repo.name, chosen);
  }

  // Done with interactive prompts; release stdin so git/npm output isn't held up.
  closePrompts();

  const windowName = buildWindowName(description, ticket);
  const workDir = join(config.workDir, windowName);
  mkdirSync(workDir, { recursive: true });

  const defaultClaudeMd = join(CONFIG_DIR, 'CLAUDE.md');
  if (existsSync(defaultClaudeMd)) {
    copyFileSync(defaultClaudeMd, join(workDir, 'CLAUDE.md'));
  }

  for (const repo of selectedRepos) {
    let ref;
    if (isHotfix) {
      process.stdout.write(`\nResolving latest tag for ${repo.name}... `);
      ref = getLatestSemverTag(repo.url, repo.hotfixTagPattern);
      console.log(ref);
    } else {
      ref = repo.mainBranch;
      console.log(`\nCloning ${repo.name} @ ${ref}`);
    }

    const repoDir = join(workDir, repo.name);
    if (repo.windowsBacked) {
      // Clone onto the Windows-visible filesystem (e.g. /mnt/c/...) and symlink it into
      // the normal task dir, so `cd`/tmux/git/npm all see a plain path while powershell.exe
      // launched from here resolves to a real Windows path instead of a rejected UNC path.
      const winRepoDir = join(config.winWorkDir, `${windowName}-${repo.name}`);
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
      const cacheDir = ensureCache(hash, repoDir);
      linkNodeModules(repoDir, cacheDir);
    }
  }

  console.log(`\nDone. Working directory: ${workDir}`);

  const prompt = launchClaudeConfirmed
    ? buildClaudePrompt(config.claudePromptTemplate, ticket)
    : undefined;

  if (launchClaudeConfirmed) trustDirectory(workDir);

  if (isInsideTmux()) {
    let commandLine = `cd ${shellQuote(workDir)} && clear`;
    if (launchClaudeConfirmed) {
      commandLine += ` && claude --permission-mode plan${prompt ? ` ${shellQuote(prompt)}` : ''}`;
    }
    tmuxRenameAndRun(windowName, commandLine, pane);
  } else {
    console.log('(not running inside tmux — skipping window rename/cd)');
    if (launchClaudeConfirmed) launchClaude(workDir, prompt);
  }
}
