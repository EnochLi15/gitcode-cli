# GitCode Harness SOP

## Target

GitCode repository website: `https://gitcode.com/gcw_CSGJYRfL/test`

The repository cloned successfully but contained no source files at creation time. The harness therefore maps the GitCode repository page, its backing Git repository, its Personal Access Token and OAuth login flows, and its GitCode API collaboration surfaces into an agent-usable CLI.

## Backend engines

The local repository backend is the real `git` executable. The CLI invokes `git clone`, `git status`, `git branch`, `git tag`, `git remote`, `git rev-list`, and `git ls-files` through `utils/gitcode_backend.py`.

The remote collaboration backend is GitCode API v5 through `utils/gitcode_api.py`. The client uses Python stdlib HTTP calls and supports:

- `GITCODE_API_BASE` or root `--api-base`
- root `--token`
- `GITCODE_TOKEN` / `GITCODE_ACCESS_TOKEN`
- saved Personal Access Tokens or OAuth access tokens from `auth login`
- read-only public API calls without a token when GitCode permits them
- required token checks for write operations

The default auth path is Personal Access Token login through `auth login --token TOKEN`. The OAuth backend remains available through `auth setup` and browser-based `auth login`. Current probing found `/oauth/authorize` and `/oauth/token`; no device-code endpoint was found.

## Data model

The native persisted state for the harness is a project JSON file containing:

- GitCode host, owner, repository name, and URLs
- Optional local clone path
- Notes created during agent workflows
- Creation and update timestamps

Local repository facts are always read from `git`, not cached as authoritative project state. API tokens are never stored in project JSON.

OAuth app config and tokens are stored outside projects at `~/.config/cli-anything-gitcode/auth.json` by default, or at `GITCODE_AUTH_FILE` in tests. The auth file is written with `0600` permissions.

## Command mapping

| GitCode website concept | CLI command | Backend |
| --- | --- | --- |
| Personal Access Token login | `auth login --token TOKEN` | auth JSON file |
| OAuth app config | `auth setup` | auth JSON file |
| Browser OAuth login | `auth login` | `/oauth/authorize`, `/oauth/token` |
| Auth status/logout | `auth status`, `auth logout` | auth JSON file |
| Repository page URL | `project new REPO_URL` | URL parser |
| Local clone | `repo clone DESTINATION` | `git clone` |
| Repository status | `repo status` | `git status --porcelain`, `git ls-files` |
| Branch/tag view | `repo refs` | `git branch`, `git tag` |
| Issue list/detail | `issue list`, `issue get` | GitCode API `/issues` |
| Issue creation/comment | `issue create`, `issue comment` | GitCode API `/issues` |
| Pull request list/detail | `pr list`, `pr get` | GitCode API `/pulls` |
| Pull request creation/comment | `pr create`, `pr comment` | GitCode API `/pulls` |
| Review comments | `review list`, `review submit` | GitCode API `/pulls/{number}/comments` |
| Repository summary | `export report` | Project JSON + real git inspection |
| Session history | `session undo/redo` | JSON session state |

## Output model

All commands support root-level `--json`. Human output is plain key-value text; JSON output is intended for AI agents.

## Testing policy

E2E tests create real temporary git repositories and inspect them via the real `git` executable. The harness does not fake repository status and does not skip when `git` is missing.

API, PAT, and OAuth E2E tests use local mock HTTP servers, assert request method/path/token/payload behavior, and do not create live GitCode issues, PRs, review comments, or OAuth sessions.
