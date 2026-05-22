# gitcode-cli

`gitcode-cli` is a scriptable, agent-ready GitCode command line tool with a
`gh`-like shape for the workflows engineers and AI assistants repeat most:
repositories, issues, pull requests, files, releases, labels, auth, JSON
queries, aliases, and browser handoff.

It is intentionally not a broad GitCode desktop replacement or a clone of
`toads/gitcode-cli`. That project is a useful reference for native GitCode
coverage; this package optimizes for predictable terminal automation,
stable JSON fields, and GitHub CLI muscle memory where GitCode has a close
equivalent. The `web2cli` harness remains in the package as a secondary
capability for turning web apps into agent-friendly CLIs, but the README and
daily workflow surface are centered on GitCode.

- [Positioning decision](docs/project-positioning.md)
- [CHANGELOG](CHANGELOG.md)
- [`gh` compatibility matrix](docs/gh-compatibility-matrix.md)
- [Agent skill](skills/gitcode-cli/SKILL.md)

## Install

From the repository:

```bash
npm install
npm run build
npm link
gc --version
gitcode --version
```

From a published package:

```bash
npm install -g @plm-cac/gitcode-cli
gc --help
```

## Authenticate

Interactive login prompts on stderr and validates the token before saving it:

```bash
gc auth login
gc auth status
```

Script-friendly login still reads from stdin:

```bash
gc auth login --with-token < token.txt
```

Environment tokens take precedence over saved credentials:

```bash
GITCODE_TOKEN=... gc issue list -R gcw_CSGJYRfL/test --json number,title
```

Supported environment variable names are `GITCODE_TOKEN`, `GC_TOKEN`, and
`GITCODE_ACCESS_TOKEN`. Saved credentials use the user config directory, and
tokens are never embedded in git remotes.

## Daily Workflows

Repository commands:

```bash
gc repo view -R gcw_CSGJYRfL/test --json name,defaultBranchRef
gc repo list gcw_CSGJYRfL
gc repo clone gcw_CSGJYRfL/test -- --depth 1
gc repo set-default gcw_CSGJYRfL/test
```

Issue and pull request commands:

```bash
gc issue list --state open --json number,title
gc issue view 12 --comments
gc issue create --title "Bug title" --body-file issue.md
gc issue close 12 --comment "Fixed"

gc pr list --state open --base main --json number,title,headRefName
gc pr view 12 --comments
gc pr create --title "Feature" --body-file pr.md --base main --head feature/x
gc pr checkout 12
gc pr diff 12 --name-only
gc pr merge 12 --squash --delete-branch
```

File, org, SSH key, and release commands:

```bash
gc file list -R gcw_CSGJYRfL/test src --json path,type
gc file view -R gcw_CSGJYRfL/test README.md

gc org list --json login,name
gc org repos gcw_CSGJYRfL --json fullName
gc ssh-key list --json id,title
gc ssh-key add --title laptop --key-file ~/.ssh/id_ed25519.pub

gc label list
gc release list
gc release delete v1.0.0 --cleanup-tag
gc search issues "sandbox marker" -R gcw_CSGJYRfL/test --state open
gc browse -R gcw_CSGJYRfL/test issues
```

Lower-level API access:

```bash
gc api repos/gcw_CSGJYRfL/test/issues
gc api --paginate repos/gcw_CSGJYRfL/test/issues --json number,title
gc api -X POST repos/OWNER/REPO/issues -f title="Hello" -f body="Body"
```

JSON, jq, and templates:

```bash
gc issue list -R gcw_CSGJYRfL/test --json number,title --jq '.[0].title'
gc pr list -R gcw_CSGJYRfL/test --template '{{range .}}#{{.number}} {{.title}}
{{end}}'
```

Workflow helpers:

```bash
gc workflow init -R OWNER/REPO --commit-message "Initial commit"
gc workflow push --set-upstream
gc workflow diff --staged --name-only
```

Productivity helpers:

```bash
gc config set pager false
gc alias set bugs "issue list --state open --json number,title"
gc bugs
gc completion zsh
```

External commands named `gc-<name>` on `PATH` are treated as extensions.
GitHub-only product areas without GitCode equivalents are intentionally
unsupported; see [`docs/gh-compatibility-matrix.md`](docs/gh-compatibility-matrix.md)
and [`docs/gh-compatibility-boundary.md`](docs/gh-compatibility-boundary.md).

GitCode does not expose a release-only delete endpoint in the current release
API. `gc release delete TAG` will fail with guidance when release-only deletion
is unavailable; pass `--cleanup-tag` to delete the tag, which removes the
GitCode release associated with that tag.

## Agent Skill

The repository ships a first-class skill at
[`skills/gitcode-cli/SKILL.md`](skills/gitcode-cli/SKILL.md). It gives agents a
compact command reference, nudges them toward read-only and JSON-first flows,
and documents when to prompt before mutating GitCode state. Published package
metadata includes the `skills` directory so downstream agent environments can
install or reference the same guidance.

## web2cli Harness

The original web-to-CLI tool is still available as `cli-anything-web2cli`:

```bash
cli-anything-web2cli analyze ./my-web-app -o web2cli-spec.json
cli-anything-web2cli design web2cli-spec.json -o WEB2CLI.md
cli-anything-web2cli scaffold web2cli-spec.json -o generated-web-cli
```

It accepts either a local web project directory or an HTTP(S) URL. The analyzer
extracts routes, API endpoint hints, HTML forms, package scripts, framework
signals, and OpenAPI files. The scaffolder turns that spec into a small Node CLI
package with JSON output, request helpers, form inventory, endpoint inventory,
and an interactive REPL.

## Testing

Default tests build the TypeScript project and use mock HTTP servers, so they do
not mutate live GitCode data:

```bash
npm test
```

Read-only live smoke tests are opt-in and target
`https://gitcode.com/gcw_CSGJYRfL/test`:

```bash
GITCODE_LIVE=1 npm test
```

Authenticated write probes are separate and cleanup-oriented:

```bash
GITCODE_LIVE_WRITES=1 GITCODE_TOKEN=... npm test
```
