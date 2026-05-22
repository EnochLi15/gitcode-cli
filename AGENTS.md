# GitCode CLI Agent Guide

This repository contains a CLI-Anything style harness for GitCode repository
workflows. Treat `/Users/enoch/Workspace/gitcode-cli/test` as the project root;
the parent directory is only a container.

## Primary Harness

- Package root: `agent-harness/`
- Console command: `cli-anything-gitcode`
- Python namespace: `cli_anything.gitcode`
- Canonical skill: `skills/cli-anything-gitcode/SKILL.md`
- Packaged skill copy: `agent-harness/cli_anything/gitcode/skills/SKILL.md`
- Project SOP: `agent-harness/GITCODE.md`
- Readiness notes: `docs/agents/cli-anything-gitcode.md`

## Development Defaults

- Prefer `cli-anything-gitcode --json ...` for agent-facing commands.
- Run harness tests from `agent-harness/`:

```bash
python -m pytest cli_anything/gitcode/tests -v --tb=short
```

- Verify the installed executable path when changing packaging or entry points:

```bash
CLI_ANYTHING_FORCE_INSTALLED=1 python -m pytest cli_anything/gitcode/tests/test_full_e2e.py::TestCLISubprocess::test_help -v --tb=short
```

- Do not store GitCode API tokens in project JSON. Use root `--token`,
  `GITCODE_TOKEN`, `GITCODE_ACCESS_TOKEN`, or `cli-anything-gitcode auth login --token TOKEN`.
- API/PAT/OAuth tests use local mock servers; avoid live GitCode writes unless the
  user explicitly asks for them.

## CLI-Anything Shape To Preserve

New work should keep the upstream CLI-Anything contract:

- Click-based one-shot commands plus default REPL mode.
- Root `--json`, `--project`, `--dry-run`, `--api-base`, and `--token` options.
- Real backend calls for local repository operations, not fake status data.
- File-backed project/session state with undo and redo where mutations exist.
- Canonical root skill plus packaged skill copy kept in sync.
- `README.md`, `TEST.md`, and the skill updated with any new command surface.
