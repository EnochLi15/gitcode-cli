# GitHub CLI Compatibility Matrix

This CLI borrows `gh` command shapes where they make GitCode automation easier,
but it does not promise byte-for-byte `gh` parity. Stable JSON output and
GitCode API behavior take priority.

| Area | Status | Supported Commands | Important Differences |
| --- | --- | --- | --- |
| Auth | gh-like | `gc auth login`, `status`, `token`, `logout`, `setup-git` | Login validates GitCode tokens; env vars are `GITCODE_TOKEN`, `GC_TOKEN`, `GITCODE_ACCESS_TOKEN`. |
| API | gh-like | `gc api <path>`, `-X`, `-f`, `-F`, `--input`, `--paginate` | Paths target GitCode API v5 by default and retry with `access_token` when GitCode requires it. |
| Repository | gh-like | `repo list`, `view`, `clone`, `set-default`, `create`, `fork`, `sync` | Default repo is stored in `.gitcode/config.json`; GitCode metadata fields are normalized. |
| Issues | gh-like | `issue list`, `view`, `create`, `edit`, `close`, `reopen`, `comment` | GitCode issue fields are normalized to `number`, `title`, `state`, `author`, `labels`, and URLs. |
| Pull Requests | gh-like | `pr list`, `view`, `create`, `checkout`, `diff`, `status`, `comment`, `review`, `merge`, `close`, `reopen` | Local git commands are delegated to `git`; PR diff is branch-range based. |
| Files | gh-like | `file list`, `file view` | Uses GitCode repository contents endpoints; binary file viewing is rejected with an actionable error. |
| Organizations | GitCode-specific | `org list`, `view`, `repos`, `members` | Narrow account administration slice, not full enterprise administration. |
| SSH Keys | GitCode-specific | `ssh-key list`, `add`, `delete` | Covers the basic key lifecycle only. |
| Labels | gh-like | `label list`, `create`, `edit`, `delete` | Color and description fields follow GitCode API names. |
| Releases | gh-like with guard | `release list`, `view`, `create`, `delete --cleanup-tag` | GitCode currently has list/view/update release APIs but no release-only delete endpoint. `release delete TAG` asks for explicit `--cleanup-tag` before deleting the tag that backs the release. Asset upload is best-effort through GitCode API support. |
| Search | gh-like | `search repos`, `issues`, `prs` | Search result normalization is intentionally small and script-friendly. |
| Browse | exact enough | `browse`, `browse issues/N`, `browse pulls/N`, `browse tree/...`, `browse blob/...` | Opens GitCode URLs; `GITCODE_NO_BROWSER=1` prints URLs for tests and agents. |
| Config/Alias/Completion | gh-like | `config get/set/list`, `alias set/list/delete`, `completion` | Alias expansion is local to this CLI config. |
| Workflow Helpers | GitCode-specific | `workflow init`, `push`, `diff` | High-level helpers compose git and GitCode API calls with guardrails. |
| GitHub-only Areas | unsupported | gist, codespace, copilot, actions, projects, rulesets, GitHub packages | These fail as unknown commands or should be implemented as external `gc-*` extensions only if GitCode has a matching workflow. |
| Deferred | deferred | advanced org administration, full SSH/GPG key lifecycle, branch protection, project boards | Add only when there is a clear GitCode API and stable automation contract. |
