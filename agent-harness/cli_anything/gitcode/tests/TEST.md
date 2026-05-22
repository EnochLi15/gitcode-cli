# GitCode CLI Harness Test Plan

## Test Inventory Plan

- `test_core.py`: 20 unit tests planned
- `test_full_e2e.py`: 12 E2E and subprocess tests planned

## Unit Test Plan

### `core/repository.py`
- Parse GitCode HTTPS URLs into host, owner, repository name, web URL, and git URL.
- Strip optional `.git` suffix.
- Reject URLs without HTTP(S), host, owner, or repository.
- Expected tests: 3

### `core/project.py`
- Create project objects from GitCode URLs.
- Save and load project JSON round-trips.
- Inspect local repository status through the real git backend.
- Expected tests: 3

### `core/session.py`
- Load and save sessions using locked JSON writes.
- Track mutation state, undo, and redo.
- Expected tests: 2

### `core/export.py`
- Export JSON and Markdown reports from project state.
- Refuse overwrite unless requested.
- Expected tests: 1

### `utils/gitcode_api.py`
- Require tokens for write commands.
- Add auth headers and access token request fields without exposing tokens in CLI output.
- Parse JSON success responses and raise `GitCodeAPIError` for non-2xx responses.
- Exchange OAuth authorization codes through `/oauth/token`.
- Resolve tokens in this order: explicit token, environment token, saved Personal Access Token or OAuth token.
- Expected tests: 3

### `utils/gitcode_auth.py`
- Save and load auth config with `0600` permissions.
- Save Personal Access Tokens as the default login path.
- Redact tokens in status output.
- Clear tokens while preserving OAuth app config by default.
- Remove all auth config with `--all` semantics.
- Expected tests: 4

### `core/issues.py`, `core/pulls.py`, `core/reviews.py`
- Call expected GitCode API paths and payloads for list, get, create, comment, and review-comment operations.
- Expected tests: 1 combined mock API coverage test

### Skill packaging
- Assert the canonical root skill, harness skill copy, and packaged skill copy stay in sync.
- Expected tests: 1

## E2E Test Plan

The local repository backend for this harness is the installed `git` executable. E2E tests create real temporary git repositories and verify CLI outputs that depend on real `git status`, `git ls-files`, and repository inspection.

The remote collaboration backend is GitCode API v5. E2E tests use a local mock HTTP server and never create live GitCode issues, PRs, or review comments.

The Personal Access Token path stores tokens in a temporary auth file and reuses the saved token for mock API writes. The OAuth backend uses a local mock OAuth token endpoint and a real localhost callback server. Tests never create live OAuth sessions.

Planned validations:
- JSON project file is valid and includes GitCode URL metadata.
- Local repository inspection invokes `git` and reports tracked files.
- Report export creates real JSON and Markdown files with expected contents.
- Installed CLI subprocess tests resolve `cli-anything-gitcode` through `_resolve_cli()`.
- Subprocess tests cover `--help`, `--json`, PAT login, auth setup/status/login/logout, saved-token API usage, project creation, repository status, report export, issue commands, PR commands, review commands, token headers, and token-required errors.

## Realistic Workflow Scenarios

### Repository intake report
- **Simulates**: An agent receives a GitCode repository URL and needs a machine-readable local status report.
- **Operations chained**: Create project → bind a local clone path → inspect status → export report.
- **Verified**: JSON includes slug, local path, git status lines, and tracked file list.

### Human handoff report
- **Simulates**: An agent prepares a concise repository summary for a human reviewer.
- **Operations chained**: Open project → inspect local clone → export Markdown report.
- **Verified**: Markdown contains web URL, git URL, branch, commit count, and tracked file count.

### Installed CLI workflow
- **Simulates**: A real user or AI agent invokes the PATH-installed CLI from an arbitrary directory.
- **Operations chained**: Run `--help` → create project with `--json` → run repository status → export JSON report.
- **Verified**: Commands exit successfully, JSON parses, output files exist and are non-empty.

### Personal Access Token workflow
- **Simulates**: A user saves a GitCode Personal Access Token and then uses it for API writes.
- **Operations chained**: `auth login --token` → `auth status` → `issue create` with saved token.
- **Verified**: Auth file exists with `0600` permissions, token output is redacted, status reports `personal_access_token`, and API write uses the saved bearer token.

### OAuth login workflow
- **Simulates**: A user configures a GitCode OAuth app, runs browser-login flow, stores tokens securely, and then uses a saved token for API writes.
- **Operations chained**: `auth status` → `auth setup` → `auth login --no-browser --print-url` → callback with code/state → token exchange → `issue create` with saved token.
- **Verified**: Auth file exists with tokens and `0600` permissions, token output is redacted, OAuth token endpoint receives expected form fields, and API write uses saved bearer token.

### Remote collaboration workflow
- **Simulates**: An agent manages GitCode collaboration state via API.
- **Operations chained**: Create project → list issues → fetch issue → create issue → list PRs → fetch PR → create PR → list review comments → submit review comment.
- **Verified**: Mock API receives expected paths, HTTP methods, token headers, and payload fields; CLI returns parseable JSON.

## Test Results

Command run:

```bash
cd /Users/enoch/Workspace/gitcode-cli/test/agent-harness
python -m py_compile $(find cli_anything/gitcode -name '*.py' -not -path '*/__pycache__/*')
python -m pytest cli_anything/gitcode/tests -v --tb=short
```

Result:

```text
Python compilation passed.
32 tests passed in 8.17s.
```

## Summary Statistics

- Total tests: 32
- Passed: 32
- Failed: 0
- Pass rate: 100%
- Execution time: 8.17s
- CLI subprocess verification used `_resolve_cli()`, which prefers the installed `cli-anything-gitcode` when available and falls back to `python -m` for development.

## Coverage Notes

- The source GitCode repository was empty at acquisition time, so tests validate GitCode repository-page workflows, real local `git` behavior, mock GitCode API behavior, and mock OAuth behavior rather than application-specific source-code operations.
- E2E tests create real temporary git repositories, commit real files, inspect them with the real `git` executable, and verify report artifacts exist and contain expected data.
- API E2E tests use a local mock HTTP server to validate issue, PR, review-command, and saved-PAT behavior without creating live remote GitCode state.
- OAuth E2E tests use a real localhost callback server and a local mock `/oauth/token` endpoint to validate login mechanics without creating a live OAuth session.
- Network cloning, live OAuth login, and live API write operations are documented and supported by the CLI but are not used in automated tests to keep the suite deterministic and non-destructive.
