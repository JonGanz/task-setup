import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CLAUDE_CONFIG_PATH = join(homedir(), '.claude.json');

// Substitutes {ticket} into the configured template. Returns undefined if no
// template is configured, meaning claude should launch with no prompt.
export function buildClaudePrompt(template, ticket) {
  if (!template) return undefined;
  return template.replaceAll('{ticket}', ticket);
}

// Marks workDir as trusted in Claude's own config so it skips the "Do you
// trust the files in this folder?" prompt. Safe here because task-setup just
// created workDir itself — there's nothing untrusted to review.
export function trustDirectory(workDir) {
  let claudeConfig;
  try {
    claudeConfig = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.log(`  (could not read ${CLAUDE_CONFIG_PATH}, skipping auto-trust: ${e.message})`);
      return;
    }
    claudeConfig = {};
  }

  claudeConfig.projects ??= {};
  claudeConfig.projects[workDir] ??= {};
  claudeConfig.projects[workDir].hasTrustDialogAccepted = true;

  try {
    writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(claudeConfig, null, 2));
  } catch (e) {
    console.log(`  (could not write ${CLAUDE_CONFIG_PATH}, skipping auto-trust: ${e.message})`);
  }
}

// Removes workDir's entry from Claude's config, undoing trustDirectory. Call
// this when a task directory is deleted so stale trusted paths don't pile up.
export function untrustDirectory(workDir) {
  let claudeConfig;
  try {
    claudeConfig = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.log(`  (could not read ${CLAUDE_CONFIG_PATH}, skipping trust cleanup: ${e.message})`);
    }
    return;
  }

  if (!claudeConfig.projects?.[workDir]) return;
  delete claudeConfig.projects[workDir];

  try {
    writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(claudeConfig, null, 2));
  } catch (e) {
    console.log(`  (could not write ${CLAUDE_CONFIG_PATH}, skipping trust cleanup: ${e.message})`);
  }
}

// Non-tmux fallback: launches claude directly, cwd'd into workDir. Passed as
// a real argv element (no shell involved), so no escaping is needed.
export function launchClaude(workDir, prompt) {
  const args = ['--permission-mode', 'plan', ...(prompt ? [prompt] : [])];
  const result = spawnSync('claude', args, { cwd: workDir, stdio: 'inherit' });
  if (result.error) {
    console.log(`  (could not launch claude: ${result.error.message})`);
  }
}
