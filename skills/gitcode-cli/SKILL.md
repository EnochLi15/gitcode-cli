---
name: gitcode-cli
description: Use the local GitCode CLI for scriptable, agent-safe GitCode repository, issue, pull request, file, auth, and workflow operations.
---

# GitCode CLI Skill

Use `gc` or `gitcode` when the user wants to inspect or change GitCode state
from the terminal. Prefer read-only commands first, stable `--json` fields for
machine reasoning, and explicit confirmation before destructive operations.

## Quick Reference

```bash
gc auth status --json
gc auth login
gc repo view -R OWNER/REPO --json name,defaultBranchRef
gc issue list -R OWNER/REPO --state open --json number,title,state
gc issue view NUMBER -R OWNER/REPO --comments --json number,title,body,comments
gc pr list -R OWNER/REPO --state open --json number,title,headRefName,baseRefName
gc pr view NUMBER -R OWNER/REPO --comments --json number,title,body,comments
gc file list -R OWNER/REPO PATH --json path,type,size
gc file view -R OWNER/REPO PATH
gc api repos/OWNER/REPO/issues --paginate --json number,title
```

## Agent-Safe Defaults

- Start with `gc auth status --json` when an operation may need credentials.
- Use `-R OWNER/REPO` instead of relying on ambient git remotes unless the user
  clearly wants the current repository.
- Use `--json` with explicit fields for planning, summaries, and scripts.
- Use `--jq` or `--template` only for display shaping after the source JSON
  fields are known.
- Prefer `gc browse ...` with `GITCODE_NO_BROWSER=1` when you need a URL without
  opening the user's browser.
- Treat `issue close`, `pr merge`, `ssh-key delete`, `label delete`, and
  `release delete` as mutating operations that need clear user intent.
- Pass `--yes` only after confirming destructive intent. Non-interactive
  sessions require it for `pr merge`, `ssh-key delete`, `label delete`, and
  `release delete --cleanup-tag`.
- Use `gc release delete TAG --cleanup-tag` only when the user explicitly wants
  to delete the backing Git tag; GitCode does not provide release-only deletion.
- Prefer `gc issue list -R OWNER/REPO` for exact repository issue state.
  `gc search issues` is discovery-oriented and may lag behind recent writes.

## Common Flows

```bash
gc issue list -R OWNER/REPO --state open --json number,title --jq '.[0].title'
gc issue comment 12 -R OWNER/REPO --body "Investigating"
gc pr diff 7 -R OWNER/REPO --name-only
gc release delete v1.2.3 -R OWNER/REPO --cleanup-tag --yes
gc workflow diff --staged --name-only
gc workflow push --set-upstream
```

## Installation Note

This skill is packaged under `skills/gitcode-cli/SKILL.md`. Agent environments
that support filesystem skills can reference this file in place, or copy the
`skills/gitcode-cli` directory into their configured skills directory. Keep the
skill versioned with the CLI so command examples stay aligned with tests and
README documentation.
