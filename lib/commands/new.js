import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { CONFIG_DIR, loadConfig } from '../config.js';
import { askText, askConfirm, askMultiSelect, closePrompts } from '../prompt.js';
import { shallowClone, getLatestSemverTag } from '../git.js';
import { hashPackageLock, ensureCache, symlinkNodeModules } from '../cache.js';
import { buildWindowName, isInsideTmux, shellQuote, tmuxRenameAndRun } from '../tmux.js';
import { buildClaudePrompt, launchClaude } from '../claude.js';

export async function runNew(argv) {
  const config = loadConfig();

  let description = argv[0]?.trim();
  if (!description) description = await askText('Task description');
  if (!description) throw new Error('A task description is required.');

  const launchClaudeConfirmed = await askConfirm('Launch Claude Code?');
  let ticket;
  if (launchClaudeConfirmed) {
    ticket = await askText('Ticket number');
    if (!ticket) throw new Error('A ticket number is required to launch Claude Code.');
  }

  const selectedRepos = await askMultiSelect('Select repos:', config.repos);
  const isHotfix = await askConfirm('Hotfix?');

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
    shallowClone(repo.url, ref, repoDir);

    const lockFile = join(repoDir, 'package-lock.json');
    if (existsSync(lockFile)) {
      const hash = hashPackageLock(lockFile);
      const cacheDir = ensureCache(hash, repoDir);
      symlinkNodeModules(repoDir, cacheDir);
    }
  }

  console.log(`\nDone. Working directory: ${workDir}`);

  const prompt = launchClaudeConfirmed
    ? buildClaudePrompt(config.claudePromptTemplate, ticket)
    : undefined;

  if (isInsideTmux()) {
    let commandLine = `cd ${shellQuote(workDir)}`;
    if (launchClaudeConfirmed) {
      commandLine += ` && claude --permission-mode plan${prompt ? ` ${shellQuote(prompt)}` : ''}`;
    }
    tmuxRenameAndRun(windowName, commandLine);
  } else {
    console.log('(not running inside tmux — skipping window rename/cd)');
    if (launchClaudeConfirmed) launchClaude(workDir, prompt);
  }
}
