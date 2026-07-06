#!/usr/bin/env node
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { loadConfig } from '../lib/config.js';
import { askText, askConfirm, askMultiSelect, closePrompts } from '../lib/prompt.js';
import { shallowClone, getLatestSemverTag } from '../lib/git.js';
import { hashPackageLock, ensureCache, symlinkNodeModules } from '../lib/cache.js';

async function main() {
  const config = loadConfig();

  let ticket = process.argv[2]?.trim();
  if (!ticket) ticket = await askText('Ticket');
  if (!ticket) throw new Error('A ticket identifier is required.');

  const selectedRepos = await askMultiSelect('Select repos:', config.repos);
  const isHotfix = await askConfirm('\nHotfix?');

  // Done with interactive prompts; release stdin so git/npm output isn't held up.
  closePrompts();

  const workDir = join(config.workDir, ticket);
  mkdirSync(workDir, { recursive: true });

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
}

main().catch(err => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
