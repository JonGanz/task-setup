import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export const CONFIG_DIR = join(homedir(), '.config', 'task-setup');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const DEFAULT_TAG_PATTERN = 'v[0-9]+\\.[0-9]+\\.[0-9]+';

function expandHome(p) {
  return typeof p === 'string' && p.startsWith('~/') ? join(homedir(), p.slice(2)) : p;
}

export function loadConfig() {
  let raw;
  try {
    raw = readFileSync(CONFIG_PATH, 'utf8');
  } catch {
    throw new Error(`Config not found at ${CONFIG_PATH}.\nCreate it with at least: { "repos": [{ "name": "...", "url": "..." }] }`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Config JSON is invalid: ${e.message}`);
  }

  if (!Array.isArray(config.repos) || config.repos.length === 0) {
    throw new Error('Config must have a non-empty "repos" array.');
  }

  for (const repo of config.repos) {
    if (!repo.name || !repo.url) {
      throw new Error(`Each repo entry requires "name" and "url". Offending entry: ${JSON.stringify(repo)}`);
    }
  }

  if (config.claudePromptTemplate !== undefined && typeof config.claudePromptTemplate !== 'string') {
    throw new Error('"claudePromptTemplate" must be a string if provided.');
  }

  const globalTagPattern = config.hotfixTagPattern ?? DEFAULT_TAG_PATTERN;

  return {
    workDir: expandHome(config.workDir ?? '~/work/tasks'),
    claudePromptTemplate: config.claudePromptTemplate,
    repos: config.repos.map(r => ({
      name: r.name,
      url: r.url,
      mainBranch: r.mainBranch ?? 'develop',
      hotfixTagPattern: r.hotfixTagPattern ?? globalTagPattern,
    })),
  };
}
