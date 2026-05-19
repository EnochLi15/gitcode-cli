# GitCode CLI Harness Test Plan

## Test Inventory Plan

- `test_core.py`: 14 unit tests planned
- `test_full_e2e.py`: 9 E2E and subprocess tests planned

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
- Expected tests: 2

### `core/issues.py`, `core/pulls.py`, `core/reviews.py`
- Call expected GitCode API paths and payloads for list, get, create, comment, and review-comment operations.
- Expected tests: 1 combined mock API coverage test

## E2E Test Plan

The local repository backend for this harness is the installed `git` executable. E2E tests create real temporary git repositories and verify CLI outputs that depend on real `git status`, `git ls-files`, and repository inspection.

The remote collaboration backend is GitCode API v5. E2E tests use a local mock HTTP server and never create live GitCode issues, PRs, or review comments.

Planned validations:
- JSON project file is valid and includes GitCode URL metadata.
- Local repository inspection invokes `git` and reports tracked files.
- Report export creates real JSON and Markdown files with expected contents.
- Installed CLI subprocess tests resolve `cli-anything-gitcode` through `_resolve_cli()`.
- Subprocess tests cover `--help`, `--json`, project creation, repository status, report export, issue commands, PR commands, review commands, token headers, and token-required errors.

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

### Remote collaboration workflow
- **Simulates**: An agent manages GitCode collaboration state via API.
- **Operations chained**: Create project → list issues → fetch issue → create issue → list PRs → fetch PR → create PR → list review comments → submit review comment.
- **Verified**: Mock API receives expected paths, HTTP methods, token headers, and payload fields; CLI returns parseable JSON.

## Test Results

Command run:

```bash
CLI_ANYTHING_FORCE_INSTALLED=1 python3 -m pytest "/Users/enoch/Workspace/gitcode-cli/test/agent-harness/cli_anything/gitcode/tests" -v --tb=no
```

Full output:

```text
============================= test session starts ==============================
platform darwin -- Python 3.10.13, pytest-9.0.3, pluggy-1.6.0 -- /Users/enoch/miniforge3/bin/python3
cachedir: .pytest_cache
rootdir: /Users/enoch/Workspace/gitcode-cli/test/agent-harness
plugins: anyio-4.13.0
collecting ... collected 23 items

test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_parse_repository_url PASSED [  4%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_parse_repository_url_strips_git_suffix PASSED [  8%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_parse_repository_url_rejects_invalid[gitcode.com/a/b] PASSED [ 13%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_parse_repository_url_rejects_invalid[https://gitcode.com/only-owner] PASSED [ 17%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_parse_repository_url_rejects_invalid[file:///tmp/repo] PASSED [ 21%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_create_project_from_url PASSED [ 26%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_save_and_load_project_round_trip PASSED [ 30%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_inspect_local_uses_real_git PASSED [ 34%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_session_save_load_and_status PASSED [ 39%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_session_undo_redo PASSED [ 43%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_export_report_json_and_overwrite_guard PASSED [ 47%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_api_client_requires_token_for_writes PASSED [ 52%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_api_client_get_and_error PASSED [ 56%]
test/agent-harness/cli_anything/gitcode/tests/test_core.py::test_issue_pull_review_core_functions PASSED [ 60%]
test/agent-harness/cli_anything/gitcode/tests/test_full_e2e.py::TestCLISubprocess::test_help PASSED [ 65%]
test/agent-harness/cli_anything/gitcode/tests/test_full_e2e.py::TestCLISubprocess::test_project_new_json PASSED [ 69%]
test/agent-harness/cli_anything/gitcode/tests/test_full_e2e.py::TestCLISubprocess::test_repo_status_json_with_explicit_path PASSED [ 73%]
test/agent-harness/cli_anything/gitcode/tests/test_full_e2e.py::TestCLISubprocess::test_full_project_status_report_workflow PASSED [ 78%]
test/agent-harness/cli_anything/gitcode/tests/test_full_e2e.py::TestCLISubprocess::test_markdown_report_output PASSED [ 82%]
test/agent-harness/cli_anything/gitcode/tests/test_full_e2e.py::TestCLISubprocess::test_issue_pr_review_commands_with_mock_api PASSED [ 86%]
test/agent-harness/cli_anything/gitcode/tests/test_full_e2e.py::TestCLISubprocess::test_write_command_requires_token PASSED [ 91%]
test/agent-harness/cli_anything/gitcode/tests/test_full_e2e.py::test_module_entrypoint_help PASSED [ 95%]
test/agent-harness/cli_anything/gitcode/tests/test_full_e2e.py::test_dry_run_suppresses_auto_save PASSED [100%]

============================== 23 passed in 5.26s ==============================
```

## Summary Statistics

- Total tests: 23
- Passed: 23
- Failed: 0
- Pass rate: 100%
- Execution time: 5.26s
- Installed CLI verification: `CLI_ANYTHING_FORCE_INSTALLED=1` used with `cli-anything-gitcode` available on PATH.

## Coverage Notes

- The source GitCode repository was empty at acquisition time, so tests validate GitCode repository-page workflows, real local `git` behavior, and mock GitCode API behavior rather than application-specific source-code operations.
- E2E tests create real temporary git repositories, commit real files, inspect them with the real `git` executable, and verify report artifacts exist and contain expected data.
- API E2E tests use a local mock HTTP server to validate issue, PR, and review-command behavior without creating live remote GitCode state.
- Network cloning and live API write operations are documented and supported by the CLI but are not used in automated tests to keep the suite deterministic and non-destructive.
