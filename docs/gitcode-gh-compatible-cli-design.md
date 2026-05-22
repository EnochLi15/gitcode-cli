# GitCode gh-compatible CLI Design

Target website:

```text
https://gitcode.com/gcw_CSGJYRfL/test
```

Target repository identity:

```text
host:  gitcode.com
owner: gcw_CSGJYRfL
repo:  test
```

## Goal

Build a GitCode CLI that feels like GitHub CLI (`gh`) in command shape,
flag names, output behavior, and scripting ergonomics, while mapping operations
to GitCode REST API v5 and local `git`.

Primary executable:

```bash
gc <command> <subcommand> [flags]
```

Compatibility executable:

```bash
gitcode <command> <subcommand> [flags]
```

`gc` is the GitCode equivalent of `gh`. `gitcode` is kept for discoverability
and avoids collision concerns in environments that already use `gc`.

## Design Principles

1. Match `gh` first: command groups, nouns, flags, JSON behavior, and repository
   selection should be familiar to `gh` users.
2. Prefer API over scraping: GitCode repository pages are SPA-like and static
   HTML inspection is not a stable automation contract.
3. Use local `git` for repository transport: clone, checkout, branch, status,
   diff, and patch flows should use the installed `git` binary.
4. Use GitCode REST API for platform objects: auth, repo metadata, issues, PRs,
   labels, releases, members, and search.
5. Keep all commands scriptable: stable exit codes, `--json`, `--jq`, and
   `--template` should be supported where useful.

## Source Contracts

GitCode REST API uses API version `/api/v5` and the API host:

```text
https://api.gitcode.com/api/v5
```

Auth must support Personal Access Token through these forms, in this priority:

1. `Authorization: Bearer <token>`
2. `PRIVATE-TOKEN: <token>`
3. `access_token=<token>` query fallback for endpoints that require it

The public docs describe repo, branch, issue, pull request, label, milestone,
release, webhook, member, user, organization, search, and OAuth API groups.

References:

- GitCode REST guide: https://docs.gitcode.com/en/docs/guide/
- GitCode repository API: https://docs.gitcode.com/v1-docs/docs/openapi/repos/
- GitCode issues API: https://docs.gitcode.com/v1-docs/docs/openapi/repos/issues/
- GitCode pull requests API: https://docs.gitcode.com/v1-docs/docs/openapi/repos/pulls/
- GitCode branch API: https://docs.gitcode.com/v1-docs/docs/openapi/repos/branch/
- GitHub CLI manual: https://cli.github.com/manual/

## Repository Resolution

Every repo-scoped command resolves the repository in this order:

1. `-R, --repo [HOST/]OWNER/REPO`
2. `GC_REPO`
3. current local git remote URL
4. saved project context in `.gitcode/config.json`
5. explicit error with a `gc repo set-default` suggestion

Examples:

```bash
gc repo view -R gcw_CSGJYRfL/test
gc issue list -R gitcode.com/gcw_CSGJYRfL/test
GC_REPO=gcw_CSGJYRfL/test gc pr list
```

## Global Flags

Mirror `gh` naming wherever possible:

```text
-R, --repo [HOST/]OWNER/REPO  Select another repository
--hostname HOST              Select GitCode host, default gitcode.com
--json fields                Output selected JSON fields
--jq expression              Filter JSON output with jq syntax
--template string            Format JSON output with a template
--web                        Open result in browser
--paginate                   Fetch all pages for list API commands
--help                       Show help
--version                    Show version
```

JSON behavior:

- without `--json`, print human tables matching `gh` style;
- with `--json`, print only valid JSON to stdout;
- errors go to stderr unless JSON output is explicitly requested;
- `--jq` and `--template` require `--json`, same as `gh`.

## Command Surface

### `gc auth`

`gh`-compatible intent: authenticate CLI and git with the host.

```bash
gc auth login
gc auth login --with-token < token.txt
gc auth status
gc auth logout
gc auth token
gc auth refresh
gc auth setup-git
```

Implementation:

- store tokens in OS keychain when available;
- fallback to `~/.config/gitcode/hosts.yml`;
- support env vars `GITCODE_TOKEN`, `GC_TOKEN`, `GITCODE_ACCESS_TOKEN`;
- `setup-git` configures credential helper and default host behavior.

### `gc repo`

Repository metadata and local clone workflows.

```bash
gc repo view [OWNER/REPO] [--web] [--json fields]
gc repo clone OWNER/REPO [DIRECTORY] [-- --depth 1]
gc repo fork OWNER/REPO
gc repo list [OWNER] [--limit 30] [--json fields]
gc repo create [NAME] [--private|--public] [--source DIR] [--push]
gc repo sync [DESTINATION]
gc repo set-default [OWNER/REPO]
```

API mapping:

- metadata: `GET /repos/{owner}/{repo}` when available;
- tree/content: `GET /repos/{owner}/{repo}/git/trees/{sha}`;
- file create/update/delete: content APIs under `/repos/{owner}/{repo}/contents/{path}`;
- local clone/push/sync: local `git`.

For the target repo:

```bash
gc repo clone gcw_CSGJYRfL/test
gc repo view gcw_CSGJYRfL/test --web
gc repo view -R gcw_CSGJYRfL/test --json name,description,defaultBranchRef
```

### `gc issue`

Match `gh issue` command grammar.

```bash
gc issue list [--state open|closed|all] [--label bug] [--assignee USER] [--limit 30]
gc issue view {NUMBER|URL} [--comments] [--web] [--json fields]
gc issue create [--title TEXT] [--body TEXT|--body-file FILE] [--label NAME] [--assignee USER]
gc issue edit NUMBER [--title TEXT] [--body TEXT] [--add-label NAME] [--remove-label NAME]
gc issue close NUMBER [--comment TEXT]
gc issue reopen NUMBER [--comment TEXT]
gc issue comment NUMBER --body TEXT
```

API mapping:

- list: `GET /repos/{owner}/{repo}/issues`
- view: `GET /repos/{owner}/{repo}/issues/{number}`
- create: GitCode issue creation endpoint, normalized behind the CLI
- edit/close/reopen: issue update endpoint
- comments: issue comment endpoints
- linked PRs: `GET /repos/{owner}/{repo}/issues/{number}/pull_requests`

### `gc pr`

Match `gh pr` command grammar.

```bash
gc pr list [--state open|closed|merged|all] [--base BRANCH] [--head BRANCH] [--limit 30]
gc pr view {NUMBER|URL|BRANCH} [--comments] [--web] [--json fields]
gc pr create [--title TEXT] [--body TEXT|--body-file FILE] [--base BRANCH] [--head BRANCH] [--draft]
gc pr checkout {NUMBER|URL|BRANCH}
gc pr diff [NUMBER] [--patch|--name-only]
gc pr status
gc pr comment NUMBER --body TEXT
gc pr review NUMBER --approve|--request-changes|--comment --body TEXT
gc pr merge NUMBER [--merge|--squash|--rebase] [--delete-branch]
gc pr close NUMBER [--comment TEXT]
gc pr reopen NUMBER
```

API mapping:

- list: `GET /repos/{owner}/{repo}/pulls`
- view: `GET /repos/{owner}/{repo}/pulls/{number}`
- create: `POST /repos/{owner}/{repo}/pulls`
- merge: pull request merge endpoint
- comments/reviews/files/commits: PR comment, review, file, and commit APIs
- checkout/diff: combine API metadata with local `git fetch`, `git checkout`,
  and `git diff`.

For the target repo:

```bash
gc pr list -R gcw_CSGJYRfL/test --state all
gc pr create -R gcw_CSGJYRfL/test --base main --head feature/x --title "feat: x"
gc pr checkout 12
```

### `gc label`

Mirror `gh label`.

```bash
gc label list
gc label create NAME --color RRGGBB --description TEXT
gc label edit NAME --new-name NAME --color RRGGBB --description TEXT
gc label delete NAME
```

### `gc release`

Mirror `gh release` where GitCode release APIs are available.

```bash
gc release list
gc release view TAG
gc release create TAG [FILES...] --title TEXT --notes TEXT
gc release upload TAG FILES...
gc release delete TAG
```

### `gc search`

Mirror `gh search`.

```bash
gc search repos QUERY
gc search issues QUERY [--state open|closed]
gc search prs QUERY [--state open|closed|merged]
```

### `gc api`

Escape hatch matching `gh api`.

```bash
gc api repos/gcw_CSGJYRfL/test/issues
gc api -X POST repos/gcw_CSGJYRfL/test/pulls -f title="..." -f head=feature -f base=main
gc api --paginate repos/gcw_CSGJYRfL/test/pulls
```

Rules:

- default host is `https://api.gitcode.com/api/v5`;
- paths without leading `/` are resolved relative to `/api/v5`;
- `-f key=value` sends form fields;
- `-F key=@file` reads file values;
- `--input file.json` sends a JSON body;
- `--silent`, `--include`, and `--method/-X` mirror `gh api` behavior.

### `gc browse`

Mirror `gh browse`.

```bash
gc browse
gc browse issues
gc browse issues/12
gc browse pulls/3
gc browse tree/main/src
```

## Output UX

Human output should follow `gh`:

```text
Showing 3 of 12 pull requests in gcw_CSGJYRfL/test

#12  feat: add parser      feature/parser  about 2h ago
#11  fix: auth token       fix/auth        about 1d ago
```

JSON fields should use GitHub-like names where possible, with raw GitCode
payload available through `--json raw`:

```bash
gc pr view 12 --json number,title,state,author,baseRefName,headRefName,url
```

Normalized field examples:

```text
html_url        -> url
user.login      -> author.login
created_at      -> createdAt
updated_at      -> updatedAt
base.ref        -> baseRefName
head.ref        -> headRefName
```

## Config Layout

```text
~/.config/gitcode/hosts.yml
~/.config/gitcode/config.yml
<repo>/.gitcode/config.json
```

Environment:

```text
GITCODE_TOKEN
GITCODE_ACCESS_TOKEN
GC_TOKEN
GC_HOST
GC_REPO
NO_COLOR
```

## Implementation Architecture

```text
src/
  cli.ts                 command router
  commands/
    auth.ts
    repo.ts
    issue.ts
    pr.ts
    api.ts
    browse.ts
    label.ts
    release.ts
    search.ts
  core/
    repoResolver.ts
    output.ts
    pagination.ts
    fieldSelector.ts
    errors.ts
  git/
    gitClient.ts
    remoteParser.ts
  gitcode/
    client.ts            REST client
    endpoints.ts         API path builders
    normalize.ts         GitCode -> gh-like DTOs
    authStore.ts
```

No command should directly assemble token-bearing URLs. All API calls go through
`gitcode/client.ts`.

## Test Plan

Unit tests:

- repository URL parser: HTTPS, SSH, GitCode browser URLs, API URLs;
- repo resolver precedence;
- GitCode API request construction and auth headers;
- pagination parsing;
- field selection for `--json`;
- GitCode payload normalization to `gh`-like DTOs.

Integration tests with mock HTTP server:

- `gc issue list/view/create/comment`;
- `gc pr list/view/create/comment/merge`;
- `gc api` with query params, form fields, JSON input, pagination;
- auth env var and saved-token fallback.

Local git tests:

- `gc repo clone`;
- `gc pr checkout`;
- remote detection from the target repo URL.

Live tests:

- opt-in only through `GITCODE_LIVE_TEST=1`;
- never create issues/PRs by default;
- target public read commands can run against `gcw_CSGJYRfL/test`.

## Phased Delivery

### Phase 1: `gh`-compatible core

- `gc auth login/status/logout/token`
- `gc api`
- `gc repo view/clone/set-default`
- repo resolver, output formatter, config, token store

### Phase 2: collaboration workflows

- `gc issue list/view/create/comment/close/reopen`
- `gc pr list/view/create/comment/checkout/diff/status`

### Phase 3: review and merge

- `gc pr review`
- `gc pr merge/close/reopen`
- `gc label`
- normalized JSON fields

### Phase 4: broader platform coverage

- `gc release`
- `gc search`
- `gc browse`
- completion generation
- aliases and extension hooks

## Acceptance Criteria

For the target repo:

```bash
gc auth status
gc repo view gcw_CSGJYRfL/test
gc repo clone gcw_CSGJYRfL/test
gc issue list -R gcw_CSGJYRfL/test --state all --json number,title,state,url
gc pr list -R gcw_CSGJYRfL/test --state all --json number,title,state,url
gc api repos/gcw_CSGJYRfL/test/issues
gc browse -R gcw_CSGJYRfL/test
```

Behavior must be close enough to `gh` that a user can usually replace:

```text
gh -> gc
github.com/OWNER/REPO -> gitcode.com/OWNER/REPO
OWNER/REPO stays OWNER/REPO
```

and keep the same workflow shape.

