# task-setup

CLI tool for bootstrapping a working directory per task and running the apps it needs. Clones the relevant repos on the right branch, wires up a shared `node_modules` cache via symlinks to avoid redundant installs, and can launch/manage the dev processes for a task in a dedicated tmux session.

## Installation

```bash
git clone <this-repo> ~/projects/task-setup
cd ~/projects/task-setup
npm install && npm link
```

`task-setup` will be available globally via your nvm bin path.

## Commands

| Command | Purpose |
|---|---|
| `task-setup new [description]` | Bootstrap a new task's working directory (clone repos, share `node_modules`) |
| `task-setup run [task]` | Start apps for a task in the `task-run` tmux session |
| `task-setup switch [task]` | Stop the active task's apps, then start another task's |
| `task-setup status` | List running apps for the active task and their liveness |
| `task-setup attach [repo[:profile]]` | Jump into a running app's tmux window/REPL |
| `task-setup stop [repo[:profile]]` | Stop one running app, or everything for the active task |

Any argument left off a command that needs one (a task for `run`/`switch`, a repo for `attach`) prompts you to pick from what's available, rather than erroring.

### Picking a command interactively

Run `task-setup` with no arguments at all to pick a command instead of remembering the name:

```
◆  Command:
│  ● new — bootstrap a new task's working directory
│  ○ run — start apps for a task
│  ○ switch — stop the active task's apps, start another's
│  ○ status — list running apps and their liveness
│  ○ attach — jump into a running app's window/REPL
│  ○ stop — stop running apps
└
```

An unrecognized command name (e.g. a typo) is a hard error listing the valid ones — it's never guessed as a task description.

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

If `~/.config/task-setup/CLAUDE.md` exists, it's copied to the root of each new working directory (e.g. `~/work/tasks/checkout-revamp/CLAUDE.md`). Useful for seeding task-scoped instructions that apply regardless of which repos are checked out. Omit the file entirely to skip this — nothing is created if it's absent.

### Config fields

| Field | Required | Default | Description |
|---|---|---|---|
| `workDir` | No | `~/work/tasks` | Root directory where per-task subdirectories are created |
| `hotfixTagPattern` | No | `v[0-9]+\.[0-9]+\.[0-9]+` | Regex pattern for matching semver release tags |
| `claudePromptTemplate` | No | *(none)* | Prompt template passed to `claude` on launch; `{ticket}` is replaced with the ticket number. If omitted, `claude` launches with no prompt argument |
| `repos[].name` | Yes | — | Short name used as the cloned directory name |
| `repos[].url` | Yes | — | Git remote URL |
| `repos[].mainBranch` | No | `develop` | Branch to clone for normal (non-hotfix) tickets |
| `repos[].hotfixTagPattern` | No | global pattern | Per-repo override for the hotfix tag pattern |
| `repos[].run` | No | — | Enables `task-setup run` for this repo; see [Run config](#run-config-reposrun) |

### Run config (`repos[].run`)

A repo needs a `run` block before it shows up in `task-setup run`'s picker. Each entry under `commands` is a named "profile" you can start independently (and simultaneously — the same repo can run under two profiles at once, each in its own tmux window):

```json
{
  "name": "backend",
  "url": "git@github.com:your-org/backend.git",
  "run": {
    "kind": "backend",
    "defaultCommand": "dev",
    "commands": {
      "dev": { "script": "dev", "repl": true },
      "staging": { "script": "dev:staging", "repl": true }
    }
  }
}
```

```json
{
  "name": "frontend",
  "url": "git@github.com:your-org/frontend.git",
  "run": {
    "kind": "frontend",
    "defaultCommand": "dev",
    "commands": {
      "dev":     { "script": "dev", "repl": false },
      "preview": { "script": "preview", "repl": false }
    }
  }
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `run.kind` | No | — | Informational only (`backend`/`frontend`); not used in any logic |
| `run.defaultCommand` | No | first key in `commands` | Reserved for future use as a default profile |
| `run.commands.<profile>.script` | One of `script`/`command` | — | Runs `npm run <script>` in the repo's directory |
| `run.commands.<profile>.command` | One of `script`/`command` | — | Runs a raw shell command instead, for cases an npm script doesn't fit |
| `run.commands.<profile>.repl` | No | `false` | Marks this profile as REPL-attachable (used for a note in `task-setup attach`) |

A repo present in a task's directory but missing a `run` block is skipped by `task-setup run`'s picker with a warning, not an error — not every repo needs to be runnable. A repo with a `run` block that isn't present in a given task's directory is noted but not selectable.

## Creating a task

```bash
task-setup new "add payment retries"
# or omit the description to be prompted:
task-setup new
```

### Interactive flow

```
◆  Task description: add payment retries

◆  Launch Claude Code?
│  Yes / No
└

◆  Ticket number: PROJ-1234

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

Done. Working directory: ~/work/tasks/1234-add-payment-retries
```

Repo selection is a checkbox list — use arrow keys and space to toggle, enter to confirm. Ctrl+C at any prompt cancels cleanly.

For a hotfix, the tool resolves the highest semver tag matching `hotfixTagPattern` via `git ls-remote` (no full clone required) and checks out at that ref.

### Description, ticket, and window naming

The task description is always collected first (via the CLI argument or an interactive prompt) and is kebab-cased to form the base of both the working directory name and the tmux window name — e.g. "add payment retries" → `add-payment-retries`.

The ticket number is only asked for if you choose to launch Claude Code, since it's otherwise unused. When a ticket is given, its segment after the first hyphen is prepended to the window name — e.g. description "add payment retries" + ticket `PROJ-1234` → `1234-add-payment-retries`. Without a ticket, the window name is just the kebab-cased description.

### tmux integration

When `task-setup new` is run inside a tmux session (`$TMUX` is set), it will, after setup completes:

1. Rename the current tmux window to the name described above.
2. Send a `cd` into the new working directory to the active pane, so your shell ends up there.

Both happen regardless of whether you choose to launch Claude Code. Outside tmux, this step is skipped with a one-line notice — there's no way for a child process to change its parent shell's directory without tmux's help.

### Claude Code launch

You're asked whether to launch Claude Code before repos are cloned; if you say yes, you're also asked for a ticket number at that point. If `claudePromptTemplate` is configured, `{ticket}` in the template is substituted with the ticket number and passed to `claude` as its initial prompt. If no template is configured, `claude` launches with no prompt at all. Either way, Claude always starts in plan mode (`--permission-mode plan`), so it won't make edits before you've reviewed and approved an approach.

Inside tmux, the launch is chained onto the same `cd` sent to the pane, so Claude starts already in the working directory. Outside tmux, `claude` is launched directly with its working directory set to the new folder (your invoking shell's own directory is unaffected).

### node_modules cache

For any cloned repo that has a `package-lock.json` at its root, the tool:

1. SHA-256 hashes the lockfile (first 16 hex chars used as the key)
2. Checks `~/.cache/task-setup/node_modules/<hash>/` for an existing install
3. On a cache miss: copies `package.json` + `package-lock.json` into the cache directory and runs `npm ci` there
4. Symlinks `<repo>/node_modules` → `<cache>/<hash>/node_modules`

Two repos with identical dependencies will share one install. The cache is safe to purge at any time:

```bash
rm -rf ~/.cache/task-setup/node_modules/
```

## Running apps for a task

Once a task's repos are cloned (via `task-setup new`), `task-setup run` starts whichever of them have a `run` config, each in its own window inside a dedicated tmux session named `task-run`. Only one task's apps run at a time — starting a different task's apps first gracefully stops whatever the currently active task has running.

### run

```bash
task-setup run                        # pick a task interactively
task-setup run add-payment-retries
```

With no task given: if a task is already active, you're asked to confirm resuming it before falling back to the picker; otherwise you go straight to a list of task directories under `workDir`.

You're then shown a checkbox list of every `repo:profile` combination available in that task's directory (excluding anything already running). Windows are named `<repo>:<profile>`, e.g. `backend:dev` and `backend:staging` can run side by side.

### switch

```bash
task-setup switch                     # pick a task interactively
task-setup switch fix-cart-crash
```

Stops every app for the currently active task (if any), then runs the same picker flow as `run` for the new task.

### status

```bash
task-setup status
```

Lists each running window for the active task with a live/dead check (cross-referencing tmux and the process's pid). Any window found dead — e.g. it crashed, or you killed it manually — is pruned from the tracked state automatically on the next call.

### attach

```bash
task-setup attach                  # pick from what's currently running
task-setup attach backend          # jumps straight in if only one profile is running
task-setup attach backend:staging  # disambiguates when multiple profiles are running
```

If you're already inside tmux, this opens the window in a floating popup (`tmux display-popup`, requires tmux ≥ 3.2) rather than switching your client to the `task-run` session — your current session/window is never actually left. Detach from the popup the normal way (prefix-`d`) to close it and land back exactly where you were. Outside tmux, it attaches directly since there's no session to preserve.

Because this is a real tmux pane rather than a piped log, MoleculerJS's `--repl` works exactly as if you'd run the command yourself — arrow keys, tab-complete, and history all work. If the repo's profile isn't marked `repl: true` in config, you can still attach — you just get a note that it wasn't expected to be interactive.

Note: the popup is itself a nested tmux client on the same server, so its prefix key is the same as your outer session's — a single prefix-`d` while the popup has focus detaches the popup (what you want), not your outer session.

### stop

```bash
task-setup stop                 # stop everything for the active task
task-setup stop backend         # stop just one repo (errors if the repo has multiple running profiles — specify repo:profile)
task-setup stop backend:staging
```

Stopping a window sends Ctrl-C to it first (SIGINT to the whole foreground process group — matters for `npm run dev` chains into `moleculer-runner`/`vite`) and waits up to 8 seconds. If the process ignores it, `task-setup` escalates to `SIGTERM`, then `SIGKILL`, then a final `tmux kill-window` as a backstop.

### Where things live

- **tmux session**: `task-run`, one window per running app. A hidden `_placeholder` window keeps the session alive even when nothing else is running, so `task-setup run` can always reuse it.
- **State**: `~/.config/task-setup/run-state.json` tracks the active task and its running windows (repo, profile, command, pid, log path). It's rebuilt/pruned automatically — you shouldn't need to touch it, but deleting it just forgets what's running without stopping anything.
- **Logs**: each window's output is piped to `~/.cache/task-setup/logs/<task>/<repo>-<profile>.log` via `tmux pipe-pane`, so you can `tail -f` a service without attaching to its window.
