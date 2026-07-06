# task-setup

CLI tool for bootstrapping a working directory per Jira ticket. Clones the relevant repos on the right branch and wires up a shared `node_modules` cache via symlinks to avoid redundant installs.

## Installation

```bash
git clone <this-repo> ~/projects/task-setup
cd ~/projects/task-setup
npm install && npm link
```

`task-setup` will be available globally via your nvm bin path.

## Configuration

Create `~/.config/task-setup/config.json`:

```json
{
  "workDir": "~/work/tasks",
  "hotfixTagPattern": "v[0-9]+\\.[0-9]+\\.[0-9]+",
  "repos": [
    {
      "name": "backend",
      "url": "git@github.com:your-org/backend.git",
      "mainBranch": "develop"
    },
    {
      "name": "frontend",
      "url": "git@github.com:your-org/frontend.git",
      "mainBranch": "develop"
    }
  ]
}
```

### Default CLAUDE.md

If `~/.config/task-setup/CLAUDE.md` exists, it's copied to the root of each new working directory (e.g. `~/work/tasks/TICK-123/CLAUDE.md`). Useful for seeding ticket-scoped instructions that apply regardless of which repos are checked out. Omit the file entirely to skip this — nothing is created if it's absent.

### Config fields

| Field | Required | Default | Description |
|---|---|---|---|
| `workDir` | No | `~/work/tasks` | Root directory where ticket subdirectories are created |
| `hotfixTagPattern` | No | `v[0-9]+\.[0-9]+\.[0-9]+` | Regex pattern for matching semver release tags |
| `claudePromptTemplate` | No | *(none)* | Prompt template passed to `claude` on launch; `{ticket}` is replaced with the ticket ID. If omitted, `claude` launches with no prompt argument |
| `repos[].name` | Yes | — | Short name used as the cloned directory name |
| `repos[].url` | Yes | — | Git remote URL |
| `repos[].mainBranch` | No | `develop` | Branch to clone for normal (non-hotfix) tickets |
| `repos[].hotfixTagPattern` | No | global pattern | Per-repo override for the hotfix tag pattern |

## Usage

```bash
task-setup TICK-123
# or omit the ticket to be prompted:
task-setup
```

### Interactive flow

```
◆  Select repos:
│  ◻ backend
│  ◻ frontend
│  ◻ admin-ui
└

◆  Hotfix?
│  Yes / No
└

Cloning backend @ develop
Cloning frontend @ develop
  → Cache miss [abc1234f56789012], running npm ci...
  → node_modules symlinked

Done. Working directory: ~/work/tasks/TICK-123

◆  Launch Claude Code?
│  Yes / No
└
```

Repo selection is a checkbox list — use arrow keys and space to toggle, enter to confirm. Ctrl+C at any prompt cancels cleanly.

For a hotfix, the tool resolves the highest semver tag matching `hotfixTagPattern` via `git ls-remote` (no full clone required) and checks out at that ref.

## tmux integration

When `task-setup` is run inside a tmux session (`$TMUX` is set), it will, after setup completes:

1. Rename the current tmux window to the ticket ID.
2. Send a `cd` into the new working directory to the active pane, so your shell ends up there.

Both happen regardless of whether you choose to launch Claude Code. Outside tmux, this step is skipped with a one-line notice — there's no way for a child process to change its parent shell's directory without tmux's help.

## Claude Code launch

After setup, you're asked whether to launch Claude Code. If `claudePromptTemplate` is configured, `{ticket}` in the template is substituted with the ticket ID and passed to `claude` as its initial prompt. If no template is configured, `claude` launches with no prompt at all.

Inside tmux, the launch is chained onto the same `cd` sent to the pane, so Claude starts already in the working directory. Outside tmux, `claude` is launched directly with its working directory set to the new folder (your invoking shell's own directory is unaffected).

## node_modules cache

For any cloned repo that has a `package-lock.json` at its root, the tool:

1. SHA-256 hashes the lockfile (first 16 hex chars used as the key)
2. Checks `~/.cache/task-setup/node_modules/<hash>/` for an existing install
3. On a cache miss: copies `package.json` + `package-lock.json` into the cache directory and runs `npm ci` there
4. Symlinks `<repo>/node_modules` → `<cache>/<hash>/node_modules`

Two repos with identical dependencies will share one install. The cache is safe to purge at any time:

```bash
rm -rf ~/.cache/task-setup/node_modules/
```
