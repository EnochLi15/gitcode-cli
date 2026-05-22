# CLI-Anything Readiness For GitCode CLI

## Source Baseline

Reviewed upstream `HKUDS/CLI-Anything` on `main` at
`436a4f5c42452b86b64fe0373e1ed67a4347a18a`.

Relevant upstream pieces:

- `cli-anything-plugin/HARNESS.md`: seven-phase harness methodology.
- `cli-anything-plugin/guides/skill-generation.md`: root skill plus packaged
  compatibility copy.
- `cli-anything-plugin/templates/SKILL.md.template`: agent-facing skill shape.
- `cli-hub/`: optional registry/installer path; not required for local GitCode
  CLI development.

Upstream contract to keep: analyze target surface, design stateful command
groups, implement Click CLI + REPL, expose JSON output, test with real backends,
document results, generate skills, then package/install.

## Local Readiness

The local harness is already installed in editable mode:

```bash
which cli-anything-gitcode
python -m pip show cli-anything-gitcode
```

Expected package location:

```text
/Users/enoch/Workspace/gitcode-cli/test/agent-harness
```

Current command surface:

- `auth`: Personal Access Token login, OAuth app setup, browser login, status, logout.
- `project`: create/open/save/info/set-local/note project JSON.
- `repo`: real `git clone`, `git status`, branch/tag inspection.
- `issue`: list/get/create/comment through GitCode API v5.
- `pr`: list/get/create/comment through GitCode API v5.
- `review`: list/submit pull request review comments.
- `export`: JSON or Markdown repository reports.
- `session`: status/undo/redo.
- no subcommand: stateful REPL.

Skills are already present in all expected locations:

- `skills/cli-anything-gitcode/SKILL.md`
- `agent-harness/skills/cli-anything-gitcode/SKILL.md`
- `agent-harness/cli_anything/gitcode/skills/SKILL.md`

## Verification Snapshot

Commands run on 2026-05-21:

```bash
cd /Users/enoch/Workspace/gitcode-cli/test/agent-harness
python -m py_compile $(find cli_anything/gitcode -name '*.py' -not -path '*/__pycache__/*')
python -m pytest cli_anything/gitcode/tests -v --tb=short
CLI_ANYTHING_FORCE_INSTALLED=1 python -m pytest cli_anything/gitcode/tests/test_full_e2e.py::TestCLISubprocess::test_help -v --tb=short
```

Results:

- Python compilation passed.
- Full harness tests passed: `32 passed in 8.17s`.
- Installed executable smoke test passed: `1 passed in 0.12s`.

## Agent Usage Pattern

Start new GitCode work by creating or opening a project file:

```bash
cli-anything-gitcode --json project new https://gitcode.com/OWNER/REPO -o /absolute/path/project.json
cli-anything-gitcode --json --project /absolute/path/project.json session status
```

Bind a local clone before repository inspection:

```bash
cli-anything-gitcode --project /absolute/path/project.json project set-local /absolute/path/repo
cli-anything-gitcode --json --project /absolute/path/project.json repo status
```

Use auth only when write access is needed. Prefer Personal Access Token login:

```bash
cli-anything-gitcode auth login --token YOUR_TOKEN
cli-anything-gitcode --json auth status
```

OAuth remains available as an advanced fallback:

```bash
cli-anything-gitcode auth setup --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET --redirect-port 8765
cli-anything-gitcode auth login
cli-anything-gitcode --json auth status
```

For scripted writes, prefer environment tokens in automation and never commit
token-bearing files:

```bash
GITCODE_TOKEN=... cli-anything-gitcode --json --project /absolute/path/project.json issue create --title "Bug" --body "Steps"
```

## Development Checklist

When adding new GitCode CLI capability:

1. Add core behavior under `agent-harness/cli_anything/gitcode/core/` or
   `utils/` before wiring Click commands.
2. Keep command output JSON-serializable and stable under root `--json`.
3. Use mock HTTP servers for API tests; do not create live issues or PRs in
   normal test runs.
4. Update `agent-harness/cli_anything/gitcode/README.md`.
5. Update `agent-harness/cli_anything/gitcode/tests/TEST.md`.
6. Keep all three `SKILL.md` copies in sync when command surface changes.
7. Run the full harness tests and the installed executable smoke test.

## Gaps To Consider Next

- Add API coverage for pagination and GitCode-specific response variants if
  live probing uncovers shape differences.
- Consider publishing metadata only after command/API behavior stabilizes; the
  upstream CLI-Hub path is useful but not needed for local development.
