---
name: "cli-anything-gitcode"
description: "Operate GitCode repository pages, local clones, issues, pull requests, and review comments through a stateful CLI backed by real git and GitCode API v5. Use for GitCode URLs, repository intake, clone/status/ref inspection, issue creation, PR creation, review comments, and JSON reports."
---

# GitCode CLI Skill

Use `cli-anything-gitcode` when you need to turn a GitCode repository page into an agent-operable command surface.

The CLI uses the real `git` executable for local repository operations and GitCode API v5 for issue, pull request, and review-comment workflows.

## Install

```bash
cd agent-harness
pip install -e .
which cli-anything-gitcode
```

`git` must be installed and available on PATH.

## Authentication

Read commands may work for public repositories without a token. Write commands require a token:

```bash
export GITCODE_TOKEN=your-token
# or
export GITCODE_ACCESS_TOKEN=your-token
```

You can also pass `--token` for one command. Use `GITCODE_API_BASE` or `--api-base` to target a mock server or alternate GitCode API base.

Tokens are never stored in project JSON.

## Agent defaults

Prefer `--json` for every one-shot command:

```bash
cli-anything-gitcode --json project new https://gitcode.com/gcw_CSGJYRfL/test -o gitcode-test.json
```

Open an existing project with `--project`:

```bash
cli-anything-gitcode --json --project gitcode-test.json session status
```

Use `--dry-run` when testing local project mutations without saving changes. `--dry-run` does not fake remote write commands.

## Command groups

### `project`

Create and manage the project JSON that records the GitCode URL and optional local clone path.

```bash
cli-anything-gitcode --json project new https://gitcode.com/gcw_CSGJYRfL/test -o gitcode-test.json
cli-anything-gitcode --json --project gitcode-test.json project info
cli-anything-gitcode --project gitcode-test.json project set-local /path/to/local/clone
cli-anything-gitcode --project gitcode-test.json project note "reviewed empty repository"
```

### `repo`

Run real git-backed repository operations.

```bash
cli-anything-gitcode --project gitcode-test.json repo clone ./test
cli-anything-gitcode --json --project gitcode-test.json repo status
cli-anything-gitcode --json --project gitcode-test.json repo refs
```

### `issue`

List, fetch, create, and comment on GitCode issues.

```bash
cli-anything-gitcode --json --project gitcode-test.json issue list --state open
cli-anything-gitcode --json --project gitcode-test.json issue get 1
cli-anything-gitcode --json --project gitcode-test.json issue create --title "Bug" --body "Steps" --label bug
cli-anything-gitcode --json --project gitcode-test.json issue comment 1 --body "Confirmed"
```

### `pr`

List, fetch, create, and comment on GitCode pull requests.

```bash
cli-anything-gitcode --json --project gitcode-test.json pr list --state open
cli-anything-gitcode --json --project gitcode-test.json pr get 1
cli-anything-gitcode --json --project gitcode-test.json pr create --title "Fix" --head feature/fix --base main --body "Summary"
cli-anything-gitcode --json --project gitcode-test.json pr comment 1 --body "Ready for review"
```

### `review`

List and submit pull request review comments.

```bash
cli-anything-gitcode --json --project gitcode-test.json review list 1
cli-anything-gitcode --json --project gitcode-test.json review submit 1 --body "Please update this line" --path README.md --line 12 --commit-id abc123
```

### `export`

Create machine or human-readable reports from project metadata and real git inspection.

```bash
cli-anything-gitcode --json --project gitcode-test.json export report report.json --format json --overwrite
cli-anything-gitcode --project gitcode-test.json export report report.md --format markdown --overwrite
```

### `session`

Inspect session state and undo or redo project mutations.

```bash
cli-anything-gitcode --json --project gitcode-test.json session status
cli-anything-gitcode --project gitcode-test.json session undo
cli-anything-gitcode --project gitcode-test.json session redo
```

## REPL

Run without a subcommand to enter the stateful REPL:

```bash
cli-anything-gitcode
```

Inside the REPL, use the same subcommands without the top-level executable name.

## Typical workflow

```bash
cli-anything-gitcode --json project new https://gitcode.com/gcw_CSGJYRfL/test -o gitcode-test.json
cli-anything-gitcode --project gitcode-test.json repo clone ./test
cli-anything-gitcode --json --project gitcode-test.json issue list
cli-anything-gitcode --json --project gitcode-test.json pr list
cli-anything-gitcode --json --project gitcode-test.json export report gitcode-report.json --format json --overwrite
```

## Error handling

- Missing `git` is a hard dependency error with install instructions.
- `repo status` requires either an explicit path or a project with `local_path` set.
- API write commands require `GITCODE_TOKEN`, `GITCODE_ACCESS_TOKEN`, or `--token`.
- `export report` refuses to overwrite existing files unless `--overwrite` is passed.
