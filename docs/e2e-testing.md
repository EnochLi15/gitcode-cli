# E2E Testing Framework

The GitCode CLI E2E suite uses Node's built-in `node:test` runner. The default
suite is fully mocked: it spawns the compiled CLI, records stdout/stderr/exit
codes, serves GitCode API responses from local HTTP servers, and uses temporary
config directories and mock git binaries.

## Test Layers

- `test/gh-contract.e2e.mjs` runs a data-driven GitHub CLI compatibility matrix.
  Cases live in `test/contracts/ghContractCases.mjs`.
- `test/workflow-git.e2e.mjs` verifies local git orchestration with a mock git
  binary.
- `test/live-repo-create.e2e.mjs` is opt-in and can create a real temporary
  GitCode repository, verify it, then delete it through `gc api`.
- Existing `test/*.test.mjs` files continue to cover broader command workflows.

## Current E2E Coverage

The mock E2E suite covers the common daily command surface:

| Area | Commands covered |
| --- | --- |
| Auth | `auth login --with-token`, `auth status --json` |
| API | `api --paginate`, `api -X`, `api -f`, `api -F @file`, `api --input`, access-token fallback |
| Repository | `repo view`, `repo list`, `repo create`, `repo fork`, `repo clone`, `repo sync`, `repo set-default` |
| Issues | `issue list`, `issue view --comments`, `issue create`, `issue edit`, `issue close`, `issue reopen`, `issue comment` |
| Pull requests | `pr list`, `pr view --comments`, `pr create`, `pr comment`, `pr review`, `pr close`, `pr reopen`, `pr merge`, `pr checkout`, `pr diff`, `pr status` |
| Files | `file list`, `file view` |
| Organizations | `org list`, `org view`, `org repos`, `org members` |
| SSH keys | `ssh-key list`, `ssh-key add`, guarded and confirmed `ssh-key delete` |
| Labels | `label list`, `label create`, `label edit`, guarded and confirmed `label delete` |
| Releases | `release list`, `release view`, `release create`, guarded `release delete`, confirmed `release delete --cleanup-tag` |
| Search | `search repos`, `search issues`, `search prs` |
| Browser handoff | `browse` with `GITCODE_NO_BROWSER=1` |
| Productivity | `config get/set`, `alias set/list/expansion`, `completion` |
| Workflow helpers | `workflow init`, `workflow push`, `workflow diff` |

The live repository E2E covers `repo create`, `repo view`, and cleanup through
`api -X DELETE`.

## Helpers

- `test/helpers/cliRunner.mjs` spawns `dist/cli.js` and creates isolated envs.
- `test/helpers/mockGitcodeServer.mjs` provides a local GitCode API mock and
  ordered request contract assertions.
- `test/helpers/mockGit.mjs` creates a git binary shim that records command
  arguments for workflow tests.

## Commands

```bash
npm test
npm run test:e2e
npm run test:e2e:mock
```

Live read smoke tests remain opt-in:

```bash
GITCODE_LIVE=1 npm run test:e2e
```

Live repository creation is even more explicit because it mutates real GitCode
state:

```bash
GITCODE_LIVE_REPO_CREATE=1 GITCODE_TOKEN=... npm run test:e2e:live-repo
```

The live repo test creates a unique private repository, validates `repo view`,
and attempts cleanup with:

```bash
gc api -X DELETE repos/OWNER/REPO
```

If cleanup fails, the test fails with the repository name so it can be removed
manually.
