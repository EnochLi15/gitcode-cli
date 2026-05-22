# GitCode CLI gh Compatibility Boundary

This project targets gh-like daily GitCode workflows, not a byte-for-byte clone
of every GitHub CLI feature. Commands should use familiar gh nouns, flags,
JSON behavior, and exit codes when GitCode has an equivalent platform concept.

## Required Daily Workflows

- `auth`: token login, status, token retrieval, logout, and git credential setup.
- `api`: direct GitCode REST API calls with JSON bodies, field arguments,
  pagination, token headers, and access-token query fallback.
- `repo`: list, view, clone, set default, create, fork, and local sync.
- `issue`: list, view, create, edit, close, reopen, comment, labels,
  assignees, body files, linked pull request fallback, and web URLs.
- `pr`: list, view, create, comment, review, close, reopen, checkout, diff,
  status, merge strategy flags, and guarded source-branch cleanup.
- `label`: list, create, edit, and delete labels.
- `release`: list, view, create, and delete releases; asset upload is attempted
  where the GitCode API accepts it and otherwise reported as an API limitation.
- `search`: repositories, issues, and pull requests with query, state, owner,
  repo, and limit filters where GitCode supports them.
- `browse` and `--web`: repository, issue, pull request, release, branch, tree,
  blob, and arbitrary repository paths.
- Productivity: `config`, `alias`, `completion`, and external `gc-*` extension
  hooks.

## Unsupported Or Deferred GitHub-Only Areas

GitHub-specific products such as Codespaces, Copilot, Actions secrets,
GitHub Projects, GitHub Discussions, and GitHub Packages are out of scope unless
GitCode exposes equivalent APIs. Unknown commands fail with actionable text and
can be supplied by external executables named `gc-<command>` on `PATH`.

When GitCode lacks a strategy or endpoint, the command should prefer an explicit
API limitation error over pretending success. Tests may skip authenticated live
write probes when a token is missing, permissions are insufficient, or the
sandbox endpoint is unavailable.

## Validation Policy

Default tests use mock HTTP servers and temporary git repositories. They must not
mutate live GitCode data.

Read-only live smoke tests are enabled with:

```bash
GITCODE_LIVE=1 npm test
```

Authenticated write probes are enabled separately and must use unique test
markers plus cleanup:

```bash
GITCODE_LIVE_WRITES=1 GITCODE_TOKEN=... npm test
```

The canonical sandbox is `https://gitcode.com/gcw_CSGJYRfL/test`.
