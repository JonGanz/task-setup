# task-setup

CLI tool for bootstrapping a working directory per Jira ticket. Clones the relevant repos on the right branch and wires up a shared `node_modules` cache via symlinks to avoid redundant installs.

## Installation

```bash
git clone <this-repo> ~/projects/task-setup
cd ~/projects/task-setup
npm link
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

### Config fields

| Field | Required | Default | Description |
|---|---|---|---|
| `workDir` | No | `~/work/tasks` | Root directory where ticket subdirectories are created |
| `hotfixTagPattern` | No | `v[0-9]+\.[0-9]+\.[0-9]+` | Regex pattern for matching semver release tags |
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
Select repos:
  1) backend
  2) frontend
  3) admin-ui
Select (e.g. 1,3 or all): 1,2

Hotfix? [y/N]: n

Cloning backend @ develop
Cloning frontend @ develop
  → Cache miss [abc1234f56789012], running npm ci...
  → node_modules symlinked

Done. Working directory: ~/work/tasks/TICK-123
```

For a hotfix, the tool resolves the highest semver tag matching `hotfixTagPattern` via `git ls-remote` (no full clone required) and checks out at that ref.

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
