# gitcode-cli

This repository contains a TypeScript GitCode CLI plus a CLI-Anything-inspired
harness for turning web applications into agent-friendly command line tools.

The GitCode command surface is available as `gc` and `gitcode`:

```bash
npm install
npm run build
npm link
gc --version
gitcode --version
gc api repos/gcw_CSGJYRfL/test/issues
gc issue list -R gcw_CSGJYRfL/test --json number,title
gc pr list -R gcw_CSGJYRfL/test --state open
gc browse -R gcw_CSGJYRfL/test issues
```

Authentication can come from `GITCODE_TOKEN`, `GC_TOKEN`, or
`GITCODE_ACCESS_TOKEN`, or from the saved auth store:

```bash
gc auth login --with-token < token.txt
gc auth status
gc auth setup-git
```

Saved credentials use the user config directory as a portable fallback. The CLI
also sends bearer and private-token headers and can retry with GitCode's
`access_token` query convention for endpoints that require it. Tokens are never
embedded in git remotes.

## Common Workflows

```bash
gc repo view -R gcw_CSGJYRfL/test --json name,defaultBranchRef
gc repo list gcw_CSGJYRfL
gc repo clone gcw_CSGJYRfL/test -- --depth 1
gc repo set-default gcw_CSGJYRfL/test

gc issue list --state open --label bug
gc issue view 12 --comments
gc issue create --title "Bug title" --body-file issue.md
gc issue edit 12 --add-label bug --remove-label stale
gc issue close 12 --comment "Fixed"

gc pr list --state open --base main
gc pr view 12 --comments
gc pr create --title "Feature" --body-file pr.md --base main --head feature/x
gc pr checkout 12
gc pr diff 12 --name-only
gc pr merge 12 --squash --delete-branch

gc label list
gc release list
gc search issues "sandbox marker" -R gcw_CSGJYRfL/test --state open
gc browse pulls/12
```

Productivity helpers:

```bash
gc config set pager false
gc alias set bugs "issue list --state open"
gc completion zsh
```

External commands named `gc-<name>` on `PATH` are treated as extensions. GitHub
product areas without GitCode equivalents are intentionally unsupported; see
[`docs/gh-compatibility-boundary.md`](docs/gh-compatibility-boundary.md).

The original web-to-CLI tool is still available as `cli-anything-web2cli`:

```bash
cli-anything-web2cli analyze ./my-web-app -o web2cli-spec.json
cli-anything-web2cli design web2cli-spec.json -o WEB2CLI.md
cli-anything-web2cli scaffold web2cli-spec.json -o generated-web-cli
```

It accepts either a local web project directory or an HTTP(S) URL. The analyzer
extracts routes, API endpoint hints, HTML forms, package scripts, framework
signals, and OpenAPI files. The scaffolder turns that spec into a small Node CLI
package with JSON output, request helpers, form inventory, endpoint
inventory, and an interactive REPL.

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

Without a token, the live smoke covers public read endpoints such as issues,
pull requests, and releases. GitCode currently requires a private token for the
repository metadata endpoint, so `repo view` live coverage runs when one of the
supported token environment variables is set.

Authenticated write probes are separate and cleanup-oriented. They only run when
explicitly requested:

```bash
GITCODE_LIVE_WRITES=1 GITCODE_TOKEN=... npm test
```

Live write probes use unique `gc-cli-live-*` markers and clean up created
sandbox resources when the GitCode API and token permissions allow it.
