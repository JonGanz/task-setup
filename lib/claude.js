import { spawnSync } from 'child_process';

// Substitutes {ticket} into the configured template. Returns undefined if no
// template is configured, meaning claude should launch with no prompt.
export function buildClaudePrompt(template, ticket) {
  if (!template) return undefined;
  return template.replaceAll('{ticket}', ticket);
}

// Non-tmux fallback: launches claude directly, cwd'd into workDir. Passed as
// a real argv element (no shell involved), so no escaping is needed.
export function launchClaude(workDir, prompt) {
  const args = prompt ? [prompt] : [];
  const result = spawnSync('claude', args, { cwd: workDir, stdio: 'inherit' });
  if (result.error) {
    console.log(`  (could not launch claude: ${result.error.message})`);
  }
}
