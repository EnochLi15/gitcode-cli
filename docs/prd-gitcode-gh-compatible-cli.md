# PRD: GitCode gh-Compatible CLI

## Problem Statement

The user wants to operate the GitCode repository at `https://gitcode.com/gcw_CSGJYRfL/test` from the terminal with the same mental model, command grammar, and scripting ergonomics as GitHub CLI. The current web interface is not a reliable automation surface: static analysis of the repository page does not expose stable routes, forms, or actions because the page is rendered dynamically. A useful CLI therefore needs to translate the GitCode web experience into a first-class command line interface backed by GitCode REST API v5 and local git, rather than scraping the website.

The user also wants this to remain consistent with the TypeScript web-to-CLI direction already chosen for this project. The implementation should feel familiar to `gh` users, preserve common workflows like `auth`, `repo`, `issue`, `pr`, `api`, and `browse`, and keep commands suitable for both humans and agents.

## Solution

Build a TypeScript/Node CLI for GitCode that mirrors GitHub CLI conventions while targeting GitCode. The primary executable should be `gc`, with `gitcode` as a compatibility and discoverability alias. Repo-scoped commands should accept `-R, --repo [HOST/]OWNER/REPO`, infer repository context from local git remotes when possible, and support stable JSON output for automation.

The CLI will use GitCode REST API v5 for platform data and mutations, and the local `git` binary for clone, checkout, branch, diff, and repository transport workflows. The initial target repository is `gcw_CSGJYRfL/test`, but the design must work for any GitCode repository.

The CLI should be implemented in phases:

1. Core foundation: command router, config, auth, API client, repo resolver, output formatting, and `gc api`.
2. Repository workflows: `repo view`, `repo clone`, `repo set-default`, and browser opening.
3. Issue workflows: list, view, create, edit, close, reopen, and comment.
4. Pull request workflows: list, view, create, checkout, diff, status, comment, review, merge, close, and reopen.
5. Additional GitCode platform commands: labels, releases, search, completion, aliases, and extension hooks.

## User Stories

1. As a GitCode user, I want to run `gc auth login`, so that I can authenticate with GitCode from the terminal.
2. As a GitCode user, I want to pipe a Personal Access Token into login, so that I can authenticate in CI or headless environments.
3. As a GitCode user, I want `gc auth status`, so that I can confirm which account and host are active.
4. As a GitCode user, I want `gc auth logout`, so that I can remove saved credentials.
5. As a GitCode user, I want `gc auth token`, so that scripts can retrieve the active token when appropriate.
6. As a GitCode user, I want the CLI to read `GITCODE_TOKEN`, `GITCODE_ACCESS_TOKEN`, and `GC_TOKEN`, so that automation can avoid interactive auth.
7. As a GitCode user, I want tokens stored in a secure credential store when possible, so that I do not leak credentials into project files.
8. As a GitCode user, I want `gc repo view gcw_CSGJYRfL/test`, so that I can inspect repository metadata without opening a browser.
9. As a GitCode user, I want `gc repo view --web`, so that I can jump from terminal context to the GitCode web page.
10. As a GitCode user, I want `gc repo clone gcw_CSGJYRfL/test`, so that I can clone a repository using the same pattern as `gh repo clone`.
11. As a GitCode user, I want extra git arguments passed through during clone, so that I can use options like shallow clone.
12. As a GitCode user, I want `gc repo set-default`, so that later commands can omit repeated repository arguments.
13. As a GitCode user, I want repo-scoped commands to support `-R gcw_CSGJYRfL/test`, so that I can operate outside a local clone.
14. As a GitCode user, I want repo-scoped commands to infer the repo from local git remotes, so that commands work naturally inside a clone.
15. As a GitCode user, I want repo-scoped commands to support `gitcode.com/OWNER/REPO`, so that host-qualified repository names work like GitHub CLI.
16. As a GitCode user, I want a clear error when no repository can be resolved, so that I know whether to pass `-R` or set a default.
17. As a GitCode user, I want `gc issue list`, so that I can see issues from the terminal.
18. As a GitCode user, I want `gc issue list --state open`, so that I can focus on active work.
19. As a GitCode user, I want `gc issue list --state all`, so that I can audit all issues.
20. As a GitCode user, I want `gc issue list --label bug`, so that I can filter issue triage views.
21. As a GitCode user, I want `gc issue view 12`, so that I can read an issue without the web UI.
22. As a GitCode user, I want `gc issue view 12 --comments`, so that I can see full issue context.
23. As a GitCode user, I want `gc issue view 12 --web`, so that I can open the exact issue in the browser.
24. As a GitCode user, I want `gc issue create --title ... --body ...`, so that I can create issues from terminal workflows.
25. As a GitCode user, I want `gc issue create --body-file`, so that I can create detailed issues from markdown files.
26. As a GitCode user, I want `gc issue edit`, so that I can update issue title, body, labels, and assignee.
27. As a GitCode user, I want `gc issue close`, so that I can close completed issues.
28. As a GitCode user, I want `gc issue reopen`, so that I can reopen work when needed.
29. As a GitCode user, I want `gc issue comment`, so that I can add discussion without opening the browser.
30. As a GitCode user, I want linked pull requests visible from issue views, so that I can understand implementation status.
31. As a GitCode user, I want `gc pr list`, so that I can inspect pull requests from the terminal.
32. As a GitCode user, I want `gc pr list --state open`, so that I can focus on current reviews.
33. As a GitCode user, I want `gc pr list --state merged`, so that I can review recent merged work.
34. As a GitCode user, I want `gc pr list --base main`, so that I can filter PRs targeting a branch.
35. As a GitCode user, I want `gc pr view 12`, so that I can inspect a pull request.
36. As a GitCode user, I want `gc pr view 12 --comments`, so that I can see review and discussion context.
37. As a GitCode user, I want `gc pr view 12 --web`, so that I can open the PR in GitCode.
38. As a GitCode user, I want `gc pr create`, so that I can open a PR from a branch without using the web UI.
39. As a GitCode user, I want `gc pr create --draft`, so that I can mark incomplete work clearly when GitCode supports it.
40. As a GitCode user, I want `gc pr checkout 12`, so that I can fetch and check out a PR locally.
41. As a GitCode user, I want `gc pr diff 12`, so that I can inspect PR changes from the terminal.
42. As a GitCode user, I want `gc pr diff 12 --name-only`, so that I can see changed files quickly.
43. As a GitCode user, I want `gc pr status`, so that I can see my local branch and PR relationship.
44. As a GitCode user, I want `gc pr comment`, so that I can add PR comments from the terminal.
45. As a GitCode reviewer, I want `gc pr review --approve`, so that I can approve a PR from the terminal.
46. As a GitCode reviewer, I want `gc pr review --request-changes`, so that I can request changes from the terminal.
47. As a GitCode reviewer, I want `gc pr review --comment`, so that I can leave non-blocking review feedback.
48. As a GitCode maintainer, I want `gc pr merge`, so that I can merge PRs from the terminal.
49. As a GitCode maintainer, I want `gc pr merge --delete-branch`, so that source branches can be cleaned up after merge.
50. As a GitCode maintainer, I want `gc pr close`, so that I can close abandoned PRs.
51. As a GitCode maintainer, I want `gc pr reopen`, so that I can restore PRs that should continue.
52. As a GitCode user, I want `gc label list`, so that I can inspect available repository labels.
53. As a GitCode maintainer, I want `gc label create`, so that I can manage repository taxonomy from the terminal.
54. As a GitCode maintainer, I want `gc label edit`, so that I can update label names, descriptions, and colors.
55. As a GitCode maintainer, I want `gc label delete`, so that I can remove unused labels.
56. As a GitCode user, I want `gc release list`, so that I can inspect repository releases.
57. As a GitCode maintainer, I want `gc release create`, so that I can publish releases from the terminal when GitCode APIs support it.
58. As a GitCode user, I want `gc search repos`, so that I can discover GitCode repositories from the terminal.
59. As a GitCode user, I want `gc search issues`, so that I can find issues across GitCode.
60. As a GitCode user, I want `gc search prs`, so that I can find pull requests across GitCode.
61. As a power user, I want `gc api`, so that I can call GitCode REST API endpoints before first-class commands exist.
62. As a power user, I want `gc api --paginate`, so that I can fetch all pages for list endpoints.
63. As a power user, I want `gc api -X POST -f key=value`, so that I can script mutations with a familiar `gh api` pattern.
64. As a power user, I want `gc api --input file.json`, so that I can send structured JSON bodies.
65. As an agent, I want every list and view command to support `--json`, so that I can parse results reliably.
66. As an agent, I want `--json` to emit only JSON on stdout, so that no human formatting breaks automation.
67. As an agent, I want `--jq` support, so that I can reduce JSON output inside the CLI.
68. As an agent, I want `--template` support, so that I can produce stable custom text output.
69. As a human user, I want default output to be compact tables, so that common commands are readable.
70. As a human user, I want helpful errors with suggested fixes, so that repo resolution and auth failures are easy to recover from.
71. As a CI user, I want stable exit codes, so that shell scripts can depend on failure semantics.
72. As a Windows, macOS, or Linux user, I want the CLI to use Node and local git portably, so that installation is straightforward.
73. As a project maintainer, I want command modules separated by domain, so that future GitCode capabilities can be added without tangled code.
74. As a project maintainer, I want a deep API client module, so that auth, pagination, request formatting, and errors are tested once and reused everywhere.
75. As a project maintainer, I want a deep repo resolver module, so that all repo-scoped commands behave consistently.
76. As a project maintainer, I want DTO normalization between GitCode payloads and gh-like field names, so that output stays stable even if raw API shape differs.
77. As a project maintainer, I want mock-server tests for API commands, so that normal tests do not mutate live GitCode data.
78. As a project maintainer, I want opt-in live tests, so that public read behavior can be checked against `gcw_CSGJYRfL/test` without making writes by default.

## Implementation Decisions

- The CLI will be TypeScript/Node, matching the current project direction.
- The primary executable will be `gc`; a `gitcode` executable alias will invoke the same command surface.
- Command grammar will follow GitHub CLI conventions before inventing GitCode-specific shapes.
- Repository pages will not be scraped for core behavior. The CLI will use GitCode REST API v5 and local git.
- The API base will default to `https://api.gitcode.com/api/v5`.
- Authentication will support bearer headers, private token headers, and access token query fallback through a single client abstraction.
- Environment token precedence will include `GITCODE_TOKEN`, `GC_TOKEN`, and `GITCODE_ACCESS_TOKEN`.
- Repository selection will resolve in this order: explicit `--repo`, environment repository, local git remote, saved repo context, then a guided error.
- A repo resolver module will encapsulate GitCode URL parsing, remote parsing, host defaults, and repository normalization.
- A GitCode API client module will encapsulate request construction, authentication, pagination, response parsing, and error formatting.
- A local git module will wrap clone, fetch, checkout, branch, diff, remote, and status operations.
- An output module will own human tables, JSON field selection, jq filtering, template rendering, color decisions, and error output.
- A normalization module will map GitCode API payloads to gh-like field names while preserving access to raw payloads.
- `gc api` will be the escape hatch for unsupported endpoints and should be available early.
- `auth`, `repo`, `issue`, and `pr` command groups are the minimum useful product.
- `label`, `release`, `search`, `browse`, completion, aliases, and extension hooks can land after the core workflow.
- Write commands must require authentication and should avoid token-bearing URLs in logs or output.
- Browser-opening commands should construct GitCode web URLs from normalized repository and object identifiers.
- Commands should be usable both inside and outside local clones.
- The target repository `gcw_CSGJYRfL/test` is a validation target, not a hardcoded repository.

## Testing Decisions

- Tests should verify external behavior: command arguments, output, HTTP requests, exit codes, and local git effects. They should not assert internal implementation details.
- The API client module should be tested with a mock HTTP server for auth headers, query parameters, JSON bodies, pagination, error handling, and response parsing.
- The repo resolver module should be tested against GitCode HTTPS URLs, SSH URLs, browser URLs, API URLs, explicit `--repo` values, environment variables, and local git remotes.
- The output module should be tested for human output, `--json` field selection, empty states, errors, and jq/template behavior when implemented.
- The local git wrapper should be tested with temporary repositories for clone, remote detection, checkout, fetch, and diff behavior.
- Issue commands should be tested with mock GitCode issue payloads for list, view, create, edit, close, reopen, comments, and linked PRs.
- Pull request commands should be tested with mock GitCode PR payloads for list, view, create, checkout planning, diff metadata, comments, review, merge, close, and reopen.
- `gc api` should be tested for path resolution, method override, form fields, JSON input, pagination, and raw output.
- Live tests must be opt-in and read-only by default. The target repository can be used for live `repo view`, `issue list`, `pr list`, and `api` smoke tests.
- Tests should borrow the existing project pattern of building the TypeScript CLI and running subprocess smoke tests against the compiled executable.

## Out of Scope

- Full browser automation of the GitCode website is out of scope for the core CLI.
- Web scraping private SPA routes is out of scope unless a GitCode API gap forces a temporary fallback.
- Implementing all GitHub CLI commands is out of scope for the initial release.
- GitHub Actions equivalents are out of scope unless GitCode exposes compatible pipeline APIs.
- Codespaces, Copilot, GitHub Projects, GitHub secrets, and GitHub-specific features are out of scope.
- Mutating live GitCode data in default test runs is out of scope.
- Replacing the local `git` binary with a pure JavaScript git implementation is out of scope.
- Building a GUI or TUI is out of scope.

## Further Notes

The current web-to-CLI analyzer correctly showed that the target GitCode repository page does not expose a useful static HTML contract. That result supports the API-first design. The existing design document should remain as the architecture reference, while this PRD should drive implementation work and issue decomposition.

The highest-value first slice is not `issue` or `pr`; it is the foundation that makes every later command consistent: command routing, auth, API client, repo resolver, output formatting, and `gc api`. Once those are stable, issue and PR commands become straightforward API mappings plus output normalization.

