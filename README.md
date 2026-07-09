# task-setup

CLI tool for bootstrapping a working directory per task and running the apps it needs. Clones the relevant repos on the right branch, wires up a shared `node_modules` cache via hardlinks to avoid redundant installs, and can launch/manage the dev processes for a task in a dedicated tmux session.

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
| `task-setup open [task]` | `cd` into a task's directory in the current tmux window |
| `task-setup status` | List running apps for the active task and their liveness |
| `task-setup attach [repo[:profile]]` | Jump into a running app's tmux window/REPL |
| `task-setup stop [repo[:profile]]` | Stop one running app, or everything for the active task |
| `task-setup delete [task]` | Remove a task's working directory |

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

### Local dev patches

Drop `.patch`/`.diff` files into `~/.config/task-setup/patches/<repo-name>/` to have them applied automatically after that repo is cloned — handy for local-only changes you want every task to start with (pointing at a local service, extra debug logging, etc.) without committing them upstream.

For each selected repo that has a non-empty `patches/<repo-name>` folder, `task-setup new` prompts with the list of patches (all pre-checked — uncheck any you don't want this time). Patches are applied via `git apply` right after the clone. A repo with no `patches/<repo-name>` folder isn't prompted at all.

If a patch fails to apply (e.g. it no longer matches the branch), `task-setup new` prints a warning and continues setting up the rest of the task — a bad patch never blocks getting a working directory.

### Config fields

| Field | Required | Default | Description |
|---|---|---|---|
| `workDir` | No | `~/work/tasks` | Root directory where per-task subdirectories are created |
| `winWorkDir` | Only if any repo has `windowsBacked: true` | — | Root directory on a Windows-visible filesystem (e.g. `/mnt/c/...`) for `windowsBacked` repo clones; see [WSL2 / Windows-backed repos](#wsl2--windows-backed-repos) |
| `hotfixTagPattern` | No | `v[0-9]+\.[0-9]+\.[0-9]+` | Regex pattern for matching semver release tags |
| `claudePromptTemplate` | No | *(none)* | Prompt template passed to `claude` on launch; `{ticket}` is replaced with the ticket number. If omitted, `claude` launches with no prompt argument |
| `repos[].name` | Yes | — | Short name used as the cloned directory name |
| `repos[].url` | Yes | — | Git remote URL |
| `repos[].mainBranch` | No | `develop` | Branch to clone for normal (non-hotfix) tickets |
| `repos[].hotfixTagPattern` | No | global pattern | Per-repo override for the hotfix tag pattern |
| `repos[].windowsBacked` | No | `false` | Clone this repo onto `winWorkDir` and symlink it into the task dir; see [WSL2 / Windows-backed repos](#wsl2--windows-backed-repos) |
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
◆  Task description (optional): add payment retries

◆  Ticket number (optional): PROJ-1234

◆  Launch Claude Code?
│  Yes / No
└

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
  → node_modules linked

Done. Working directory: ~/work/tasks/1234-add-payment-retries
```

Repo selection is a checkbox list — use arrow keys and space to toggle, enter to confirm. Ctrl+C at any prompt cancels cleanly.

For a hotfix, the tool resolves the highest semver tag matching `hotfixTagPattern` via `git ls-remote` (no full clone required) and checks out at that ref.

### Description, ticket, and window naming

The task description (CLI argument or interactive prompt) and the ticket number are both optional, but at least one must be given — providing neither is an error. Whichever are present are kebab-cased/combined to form the base of both the working directory name and the tmux window name.

The ticket is now always asked for, regardless of whether you launch Claude Code — it's used for window naming either way. When a ticket is given, its segment after the first hyphen is prepended to the window name — e.g. description "add payment retries" + ticket `PROJ-1234` → `1234-add-payment-retries`. Without a ticket, the window name is just the kebab-cased description; without a description, it's just the ticket's number segment.

### tmux integration

When `task-setup new` is run inside a tmux session (`$TMUX` is set), it will, after setup completes:

1. Rename the tmux window it was started in to the name described above.
2. Send a `cd` into the new working directory to the pane it was started in, so your shell ends up there.

Both happen regardless of whether you choose to launch Claude Code, and regardless of which tmux window you're currently looking at — cloning can take a while, so the tool remembers the pane it was launched from (via `$TMUX_PANE`) and targets that pane explicitly, rather than relying on tmux's default "current window" target, which would otherwise follow you to wherever you've navigated in the meantime. Outside tmux, this step is skipped with a one-line notice — there's no way for a child process to change its parent shell's directory without tmux's help.

### Claude Code launch

You're asked whether to launch Claude Code before repos are cloned. If `claudePromptTemplate` is configured, `{ticket}` in the template is substituted with the ticket number (or removed, if left blank) and passed to `claude` as its initial prompt. If no template is configured, `claude` launches with no prompt at all. Either way, Claude always starts in plan mode (`--permission-mode plan`), so it won't make edits before you've reviewed and approved an approach.

Inside tmux, the launch is chained onto the same `cd` sent to the pane, so Claude starts already in the working directory. Outside tmux, `claude` is launched directly with its working directory set to the new folder (your invoking shell's own directory is unaffected).

### node_modules cache

For any cloned repo that has a `package-lock.json` at its root, the tool:

1. SHA-256 hashes the lockfile (first 16 hex chars used as the key)
2. Checks `~/.cache/task-setup/node_modules/<hash>/` for an existing install
3. On a cache miss: copies `package.json` + `package-lock.json` into the cache directory and runs `npm ci` there
4. Hardlinks `<repo>/node_modules` from `<cache>/<hash>/node_modules` (via `cp -al`) rather than symlinking — this keeps `node_modules`'s resolved path inside the task folder, so dev servers with strict filesystem allow-lists (e.g. Vite's `server.fs.allow`) don't reject files served through it. The files still share inodes with the cache, so anything that rewrites a file in place under `node_modules` (patch-package, native module rebuilds, postinstall scripts) mutates that shared install for every other task using the same lockfile hash.

Two repos with identical dependencies will share one install. The cache is safe to purge at any time:

```bash
rm -rf ~/.cache/task-setup/node_modules/
```

### WSL2 / Windows-backed repos

If you develop inside WSL2 but have a repo (e.g. a Tauri app) with pieces that only run correctly on native Windows, a plain clone under `workDir` won't work well for it:

- `cmd.exe`/`powershell.exe` launched from WSL2 only resolve their current directory to a real Windows path when it's actually on a `drvfs` mount (`/mnt/c/...`). A directory under `/home/...` is exposed to Windows as `\\wsl.localhost\...`, a UNC path — `cmd.exe` (and many npm `.cmd` shims that shell out to it) reject running with a UNC path as their current directory.
- The [node_modules cache](#node_modules-cache) hardlinks (`cp -al`) can't cross filesystems, so a repo cloned onto `/mnt/c` can never hardlink from the cache on your Linux filesystem — installs must be real copies instead.

Mark a repo `windowsBacked: true` and set `winWorkDir` to a directory on a Windows-visible mount:

```json
{
  "winWorkDir": "/mnt/c/wsl-tasks",
  "repos": [
    { "name": "tauri-app", "url": "git@github.com:your-org/tauri-app.git", "windowsBacked": true }
  ]
}
```

For such a repo, `task-setup new` clones it directly into `<winWorkDir>/<task>-<repo>` and creates `<task-dir>/<repo>` as a symlink to it, so it still shows up in the task directory like any other repo — `cd`, tmux, git, and npm all follow the symlink transparently. `cd`-ing into it and running `powershell.exe` (or `cmd.exe`) now resolves to a real Windows path.

The node_modules cache automatically falls back to a real recursive copy (`cp -a`) instead of hardlinking for these repos — installs are slower, use more disk, and won't share the cache with other tasks, since drvfs I/O is generally slower than the Linux filesystem too. `task-setup delete` cleans up both the symlink and the real checkout under `winWorkDir`.

## Opening a task's directory

```bash
task-setup open
# or name it directly:
task-setup open 1234-add-payment-retries
```

Prompts with the list of task directories under `workDir` (unless a name is given directly), then renames the current tmux window to the task's directory name and `cd`s into it — same as the rename-and-`cd` `task-setup new` does after cloning, just without the cloning. It doesn't touch `task-run` state; it's purely for jumping back into a task you're already working on. Like `task-setup new`, it targets the pane the command was launched from (via `$TMUX_PANE`) rather than tmux's default "current" target, so it still lands correctly even if you've switched windows in the meantime. Outside tmux, there's no shell to rename/`cd` for, so it just prints the resolved path.

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

If you're already inside tmux, this opens the window in a floating popup (`tmux display-popup`, requires tmux ≥ 3.2) rather than switching your client to the `task-run` session — your current session/window is never actually left. The popup is titled `<task> — <repo>:<profile>`, so it's clear which task's app you're looking at even with several tasks' worth of muscle memory in play. Detach from the popup the normal way (prefix-`d`) to close it and land back exactly where you were. Outside tmux, it attaches directly since there's no session to preserve.

Because this is a real tmux pane rather than a piped log, MoleculerJS's `--repl` works exactly as if you'd run the command yourself — arrow keys, tab-complete, and history all work. If the repo's profile isn't marked `repl: true` in config, you can still attach — you just get a note that it wasn't expected to be interactive.

Note: the popup is itself a nested tmux client on the same server, so its prefix key is the same as your outer session's — a single prefix-`d` while the popup has focus detaches the popup (what you want), not your outer session.

#### Binding `attach` to a key

To jump into a running app from anywhere without leaving whatever's in your current pane, bind a key in `~/.tmux.conf` that opens `task-setup attach` in its own popup:

```tmux
bind-key -n M-a display-popup -E -w 90% -h 90% -T "#(task-setup active-task) — attach" "TASK_SETUP_SKIP_POPUP=1 task-setup attach"
```

`TASK_SETUP_SKIP_POPUP=1` tells `attach` it's already running inside a popup (the one the keybinding just opened), so it attaches directly instead of opening a second, redundant popup inside that one.

A popup's title is fixed at creation and can't be changed once it's open, so the `-T` flag uses tmux's `#(shell command)` format substitution to run `task-setup active-task` — a small hidden command that just prints the active task's directory name — before the popup appears. It's what lets the outer popup show the active task even though the specific `<repo>:<profile>` isn't known yet (that's still resolved by `attach`'s own picker, running inside the popup).

### stop

```bash
task-setup stop                 # stop everything for the active task
task-setup stop backend         # stop just one repo (errors if the repo has multiple running profiles — specify repo:profile)
task-setup stop backend:staging
```

Stopping a window sends Ctrl-C to it first (SIGINT to the whole foreground process group — matters for `npm run dev` chains into `moleculer-runner`/`vite`) and waits up to 8 seconds. If the process ignores it, `task-setup` escalates to `SIGTERM`, then `SIGKILL`, then a final `tmux kill-window` as a backstop.

### delete

```bash
task-setup delete            # prompts for which task directory to remove
task-setup delete 1234-add-payment-retries
```

`git clone` leaves `.git/objects/pack/*.pack` and `*.idx` files read-only, which trips permission checks in most file managers and a plain `rm`. `delete` clears those bits (`chmod -R u+w`) before removing the task directory, so it always cleans up without prompts. If the task being deleted is the currently active one, you're asked to confirm stopping its running apps first.

### Where things live

- **tmux session**: `task-run`, one window per running app. A hidden `_placeholder` window keeps the session alive even when nothing else is running, so `task-setup run` can always reuse it.
- **State**: `~/.config/task-setup/run-state.json` tracks the active task and its running windows (repo, profile, command, pid, log path). It's rebuilt/pruned automatically — you shouldn't need to touch it, but deleting it just forgets what's running without stopping anything.
- **Logs**: each window's output is piped to `~/.cache/task-setup/logs/<task>/<repo>-<profile>.log` via `tmux pipe-pane`, so you can `tail -f` a service without attaching to its window.
