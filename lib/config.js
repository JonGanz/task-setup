import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export const CONFIG_DIR = join(homedir(), '.config', 'task-setup');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const DEFAULT_TAG_PATTERN = 'v[0-9]+\\.[0-9]+\\.[0-9]+';
const MULTIPLEXERS = ['tmux', 'zellij'];
const NPM_INSTALL_TARGETS = ['wsl', 'windows'];

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
    if (repo.npmInstallOn !== undefined && !NPM_INSTALL_TARGETS.includes(repo.npmInstallOn)) {
      throw new Error(`repo "${repo.name}": "npmInstallOn" must be one of: ${NPM_INSTALL_TARGETS.join(', ')}.`);
    }
    if (repo.npmInstallOn === 'windows' && !repo.windowsBacked) {
      throw new Error(`repo "${repo.name}": "npmInstallOn": "windows" requires "windowsBacked": true.`);
    }
  }

  if (config.claudePromptTemplate !== undefined && typeof config.claudePromptTemplate !== 'string') {
    throw new Error('"claudePromptTemplate" must be a string if provided.');
  }

  if (config.multiplexer !== undefined && !MULTIPLEXERS.includes(config.multiplexer)) {
    throw new Error(`"multiplexer" must be one of: ${MULTIPLEXERS.join(', ')}.`);
  }

  const globalTagPattern = config.hotfixTagPattern ?? DEFAULT_TAG_PATTERN;
  const winWorkDir = config.winWorkDir ? expandHome(config.winWorkDir) : undefined;

  if (!winWorkDir && config.repos.some(r => r.windowsBacked)) {
    throw new Error('"winWorkDir" must be set when any repo has "windowsBacked": true.');
  }

  return {
    workDir: expandHome(config.workDir ?? '~/work/tasks'),
    winWorkDir,
    claudePromptTemplate: config.claudePromptTemplate,
    multiplexer: config.multiplexer ?? 'tmux',
    repos: config.repos.map(r => ({
      name: r.name,
      url: r.url,
      mainBranch: r.mainBranch ?? 'develop',
      hotfixTagPattern: r.hotfixTagPattern ?? globalTagPattern,
      windowsBacked: Boolean(r.windowsBacked),
      npmInstallOn: r.npmInstallOn ?? 'wsl',
      run: r.run ? normalizeRunConfig(r.name, r.run) : undefined,
    })),
  };
}

function normalizeRunConfig(repoName, run) {
  const entries = Object.entries(run.commands ?? {});
  if (!entries.length) {
    throw new Error(`repo "${repoName}": "run.commands" must be a non-empty object.`);
  }

  const commands = {};
  for (const [profile, def] of entries) {
    if (!def.script && !def.command) {
      throw new Error(`repo "${repoName}" run command "${profile}" needs "script" or "command".`);
    }
    if (def.script && def.command) {
      throw new Error(`repo "${repoName}" run command "${profile}": specify only one of "script"/"command".`);
    }
    commands[profile] = { script: def.script, command: def.command, repl: Boolean(def.repl) };
  }

  return {
    kind: run.kind,
    commands,
    defaultCommand: run.defaultCommand ?? Object.keys(commands)[0],
  };
}
