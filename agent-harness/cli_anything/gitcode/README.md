# GitCode CLI Harness

A cli-anything harness for GitCode repositories. It converts GitCode repository URLs into a stateful, agent-friendly CLI backed by the real `git` executable and GitCode API v5.

## What it controls

This harness treats a GitCode repository page as the GUI surface and exposes repository operations as CLI commands:

- Create a local project JSON from a GitCode URL.
- Bind the project to a local clone.
- Clone with real `git clone`.
- Inspect status, branches, tags, remotes, commits, and tracked files with real `git`.
- Login with a GitCode Personal Access Token, with OAuth authorization-code login available as an advanced fallback.
- List, fetch, create, and comment on GitCode issues.
- List, fetch, create, and comment on GitCode pull requests.
- List and submit pull request review comments.
- Export JSON or Markdown repository reports.
- Use a stateful REPL for iterative agent workflows.

The source repository `https://gitcode.com/gcw_CSGJYRfL/test` was empty when this harness was created, so the CLI models GitCode repository operations rather than application-specific source code.

## Requirements

Install the real backend dependency:

```bash
brew install git      # macOS
apt install git       # Debian/Ubuntu
```

Install the CLI in editable mode:

```bash
cd agent-harness
pip install -e .
```

Verify it is on PATH:

```bash
which cli-anything-gitcode
cli-anything-gitcode --help
```

## API authentication

Read-only GitCode API commands may work for public repositories without a token. Write commands require a token.

Token resolution order:

1. root `--token`
2. `GITCODE_TOKEN`
3. `GITCODE_ACCESS_TOKEN`
4. saved Personal Access Token or OAuth token from `cli-anything-gitcode auth login`

### Personal Access Token login

Use a Personal Access Token as the default login path:

```bash
cli-anything-gitcode auth login --token your-token
cli-anything-gitcode --json auth status
```

The token is stored at:

```text
~/.config/cli-anything-gitcode/auth.json
```

The auth file is written with `0600` permissions and tokens are never stored in project JSON files.

### Environment token

```bash
export GITCODE_TOKEN=your-token
# or
export GITCODE_ACCESS_TOKEN=your-token
```

You can also pass a token for one command:

```bash
cli-anything-gitcode --token your-token --project gitcode-test.json issue create --title "Bug"
```

### OAuth login

GitCode appears to support OAuth authorization-code login, not device-code login. OAuth is still available if you need it, but PAT login is simpler for most CLI use. Create a GitCode OAuth app first and register this redirect URI:

```text
http://127.0.0.1:8765/callback
```

Then configure and login:

```bash
cli-anything-gitcode auth setup --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET --redirect-port 8765
cli-anything-gitcode auth login
cli-anything-gitcode --json auth status
```

OAuth `auth login` starts a one-shot local callback server and opens the browser.

Use `auth logout` to remove saved tokens while keeping OAuth app configuration. Use `auth logout --all` to remove all saved auth configuration.

For tests or self-hosted/alternate API deployments, override the API base:

```bash
export GITCODE_API_BASE=http://127.0.0.1:8000/api/v5
# or
cli-anything-gitcode --api-base http://127.0.0.1:8000/api/v5 ...
```

## Quick start

Create a project JSON:

```bash
cli-anything-gitcode --json project new https://gitcode.com/gcw_CSGJYRfL/test -o gitcode-test.json
```

Set an existing local clone:

```bash
cli-anything-gitcode --project gitcode-test.json project set-local /path/to/test
```

Inspect the repository:

```bash
cli-anything-gitcode --json --project gitcode-test.json repo status
cli-anything-gitcode --json --project gitcode-test.json repo refs
```

Inspect remote collaboration state:

```bash
cli-anything-gitcode --json --project gitcode-test.json issue list
cli-anything-gitcode --json --project gitcode-test.json issue get 1
cli-anything-gitcode --json --project gitcode-test.json pr list
cli-anything-gitcode --json --project gitcode-test.json pr get 1
cli-anything-gitcode --json --project gitcode-test.json review list 1
```

Create remote collaboration items:

```bash
cli-anything-gitcode --json --project gitcode-test.json issue create --title "Bug" --body "Steps to reproduce" --label bug
cli-anything-gitcode --json --project gitcode-test.json issue comment 1 --body "Confirmed"
cli-anything-gitcode --json --project gitcode-test.json pr create --title "Fix bug" --head feature/fix --base main --body "Summary"
cli-anything-gitcode --json --project gitcode-test.json pr comment 1 --body "Ready for review"
cli-anything-gitcode --json --project gitcode-test.json review submit 1 --body "Please update this line" --path README.md --line 12 --commit-id abc123
```

Export a report:

```bash
cli-anything-gitcode --project gitcode-test.json export report report.json --format json --overwrite
cli-anything-gitcode --project gitcode-test.json export report report.md --format markdown --overwrite
```

Start the REPL:

```bash
cli-anything-gitcode
```

## Command groups

### `auth`

- `auth setup --client-id ID --client-secret SECRET [--redirect-host HOST] [--redirect-port PORT] [--scope SCOPE ...]`
- `auth login --token TOKEN`
- `auth login [--host gitcode.com] [--redirect-port PORT] [--no-browser] [--print-url] [--timeout SECONDS]`
- `auth status`
- `auth logout [--all]`

### `project`

- `project new REPO_URL -o PATH [--name NAME] [--local-path PATH]`
- `project open PROJECT_JSON`
- `project save [PROJECT_JSON]`
- `project info`
- `project set-local PATH`
- `project note TEXT`

### `repo`

- `repo clone DESTINATION [--url URL] [--set-local/--no-set-local]`
- `repo status [PATH]`
- `repo refs [PATH]`

### `issue`

- `issue list [--state STATE] [--page N] [--per-page N]`
- `issue get NUMBER`
- `issue create --title TITLE [--body BODY] [--label LABEL ...] [--assignee USER]`
- `issue comment NUMBER --body BODY`

### `pr`

- `pr list [--state STATE] [--page N] [--per-page N]`
- `pr get NUMBER`
- `pr create --title TITLE --head HEAD --base BASE [--body BODY]`
- `pr comment NUMBER --body BODY`

### `review`

- `review list PR_NUMBER`
- `review submit PR_NUMBER --body BODY [--path PATH --line LINE --commit-id SHA]`

### `export`

- `export report OUTPUT_PATH --format json|markdown [--overwrite]`

### `session`

- `session status`
- `session undo`
- `session redo`

## JSON mode

Every command supports `--json` from the root command. Agents should prefer JSON mode for parsing:

```bash
cli-anything-gitcode --json --project gitcode-test.json session status
```

## Auto-save and dry-run

One-shot commands that mutate an open project auto-save when `--project` is provided. Use `--dry-run` to suppress local project auto-save:

```bash
cli-anything-gitcode --project gitcode-test.json --dry-run project note "temporary note"
```

`--dry-run` does not fake remote API write commands. Do not run `issue create`, `pr create`, or review submission unless you intend to change remote GitCode state.

## Testing

Run the full test suite:

```bash
cd agent-harness
python -m pytest cli_anything/gitcode/tests -v --tb=no
```

Run subprocess tests against the installed PATH command:

```bash
CLI_ANYTHING_FORCE_INSTALLED=1 python -m pytest cli_anything/gitcode/tests -v -s --tb=no
```

API, PAT, and OAuth tests use local mock HTTP servers and temporary auth files. They do not create live GitCode issues, PRs, review comments, or OAuth sessions.
