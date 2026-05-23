![gitcode-cli README hero](docs/assets/readme-hero.png)

# gitcode-cli

简体中文 | [English](#english)

面向工程师和 AI Agent 的 GitCode 自动化 CLI：用接近 GitHub CLI (`gh`) 的命令形态，把仓库、Issue、Pull Request、文件、Release、认证、JSON 输出和浏览器跳转变成稳定、可脚本化、适合 Agent 调用的工作流。

[快速开始](#快速开始) · [安装](#安装) · [认证](#认证) · [Agent Skill](#agent-skill) · [常用工作流](#常用工作流) · [测试](#测试) · [English](#english)

## 项目亮点

- `gh` 风格命令：保留 GitHub CLI 用户熟悉的 repo、issue、pr、release、api 等操作心智。
- Agent-ready：内置 companion skill，指导 Agent 使用稳定 JSON、显式仓库参数和安全确认流程。
- 自动化优先：`--json`、`--jq`、`--template` 和 `gc api` 适合脚本、CI 和 Agent 推理。
- 低惊讶写操作：merge、delete、release cleanup 等高风险操作在非交互环境中需要显式 `--yes`。
- 本地 git 组合：clone、checkout、diff、push 等传输动作交给本机 `git`，平台对象通过 GitCode API 操作。

## 快速开始

### 让 Agent 自动安装

如果你希望 Codex 或其他编码 Agent 自动安装本工具，可以直接把下面这段话发给 Agent：

```text
请在当前电脑/开发环境中安装并验证 gitcode-cli：
1. 检查 Node.js 和 npm 是否可用，Node.js 需要 >= 20。
2. 运行 `npm install -g @plm-cac/gitcode-cli`。
3. 验证 `gc --version`、`gitcode --version` 和 `gc --help`。
4. 运行 `gc skill status --json`，然后运行 `gc skill install --yes` 安装配套 Agent skill。
5. 再次运行 `gc skill status --json` 汇报结果。
6. 如果需要登录 GitCode，运行 `gc auth status` 检查状态；不要让我在聊天中粘贴 Token，请让我在本机交互输入或设置 `GITCODE_TOKEN`。
```

也可以把完整安装文档发给 Agent：[Agent install prompt](docs/agent-install.md)。安装完成后，Agent 可以通过 `gc skill status --json` 判断 skill 是否已经就位，并优先使用 `--json` 输出、显式仓库参数和安全确认流程。

## 适合做什么

| 场景 | 能力 |
| --- | --- |
| 仓库自动化 | 查看、克隆、创建、fork、同步仓库，设置默认仓库上下文。 |
| Issue / PR 工作流 | 列表、查看、创建、编辑、评论、关闭、重开、checkout、diff、merge。 |
| 文件和 Release | 浏览仓库文件，查看文件内容，管理 label 和 release。 |
| 账号和组织 | 登录、Token 状态、组织仓库、成员、SSH key 管理。 |
| JSON 和脚本 | `--json`、`--jq`、`--template`、`gc api`，方便脚本和 CI 解析。 |
| Agent 安全自动化 | 通过 `skills/gitcode-cli` 指导 Agent 先读后写、显式确认破坏性操作、优先稳定 JSON 输出。 |
| 浏览器交接 | `gc browse` 打开或打印 GitCode URL，适合人机协作。 |

## 安装

从仓库安装：

```bash
npm install
npm run build
npm link
gc --version
gitcode --version
```

从已发布 npm 包安装：

```bash
npm install -g @plm-cac/gitcode-cli
gc --help
```

## 认证

交互式登录会在 stderr 提示输入 Token，并在保存前验证 Token：

```bash
gc auth login
gc auth status
```

脚本友好的登录方式仍然支持从 stdin 读取 Token：

```bash
gc auth login --with-token < token.txt
```

环境变量 Token 优先级高于本地保存的凭据：

```bash
GITCODE_TOKEN=... gc issue list -R gcw_CSGJYRfL/test --json number,title
```

支持的环境变量名包括 `GITCODE_TOKEN`、`GC_TOKEN` 和 `GITCODE_ACCESS_TOKEN`。保存的凭据使用用户配置目录，Token 不会写入 git remote。

## Agent Skill

仓库内置了一个一等公民的 Agent skill：

[`skills/gitcode-cli/SKILL.md`](skills/gitcode-cli/SKILL.md)

它会提醒 Agent 优先使用只读命令、稳定 JSON 字段和显式仓库参数；在执行 `issue close`、`pr merge`、`ssh-key delete`、`label delete`、`release delete` 等变更或破坏性操作前，需要明确用户意图。

如果 CLI 已安装，使用内置安装器：

```bash
gc skill status
gc skill install
```

如果用户先安装了 skill，它也会要求 Agent 先检查 `gc` 或 `gitcode` 命令是否存在，并在缺失时引导用户安装 `@plm-cac/gitcode-cli`。

## 常用工作流

仓库命令：

```bash
gc repo view -R gcw_CSGJYRfL/test --json name,defaultBranchRef
gc repo list gcw_CSGJYRfL
gc repo clone gcw_CSGJYRfL/test -- --depth 1
gc repo set-default gcw_CSGJYRfL/test
```

Issue 和 Pull Request 命令：

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
gc pr merge 12 --squash --delete-branch --yes
```

文件、组织、SSH key 和 Release 命令：

```bash
gc file list -R gcw_CSGJYRfL/test src --json path,type
gc file view -R gcw_CSGJYRfL/test README.md

gc org list --json login,name
gc org repos gcw_CSGJYRfL --json fullName
gc ssh-key list --json id,title
gc ssh-key add --title laptop --key-file ~/.ssh/id_ed25519.pub

gc label list
gc release list
gc release delete v1.0.0 --cleanup-tag --yes
gc search issues "sandbox marker" -R gcw_CSGJYRfL/test --state open
gc browse -R gcw_CSGJYRfL/test issues
```

底层 API 访问：

```bash
gc api repos/gcw_CSGJYRfL/test/issues
gc api --paginate repos/gcw_CSGJYRfL/test/issues --json number,title
gc api -X POST repos/OWNER/REPO/issues -f title="Hello" -f body="Body"
```

JSON、jq 和模板：

```bash
gc issue list -R gcw_CSGJYRfL/test --json number,title --jq '.[0].title'
gc pr list -R gcw_CSGJYRfL/test --template '{{range .}}#{{.number}} {{.title}}
{{end}}'
```

工作流辅助命令：

```bash
gc workflow init -R OWNER/REPO --commit-message "Initial commit"
gc workflow push --set-upstream
gc workflow diff --staged --name-only
```

效率工具：

```bash
gc config set pager false
gc alias set bugs "issue list --state open --json number,title"
gc bugs
gc completion zsh
```

## 兼容边界

这个 CLI 借用 `gh` 的命令形态来降低迁移和记忆成本，但不承诺逐字节兼容。稳定 JSON 输出和 GitCode API 行为优先于完全复刻 GitHub CLI。

外部命令只要命名为 `gc-<name>` 并出现在 `PATH` 中，就会被视为扩展命令执行。没有 GitCode 等价能力的 GitHub-only 产品区会明确失败，或仅在 GitCode 有稳定自动化场景时通过外部扩展实现。

GitCode 当前 Release API 没有 release-only 删除端点。`gc release delete TAG` 在不可用时会给出说明；只有显式传入 `--cleanup-tag --yes` 时，才会删除支撑该 release 的 Git tag。其他破坏性操作，例如 `gc pr merge`、`gc label delete`、`gc ssh-key delete`，在非交互会话中也需要 `--yes`。

更多边界请看：

- [`gh` compatibility matrix](docs/gh-compatibility-matrix.md)
- [GitCode CLI compatibility boundary](docs/gh-compatibility-boundary.md)

## 测试

默认测试会构建 TypeScript 项目并使用 mock HTTP server，不会修改真实 GitCode 数据：

```bash
npm test
```

只运行 mock E2E 合同：

```bash
npm run test:e2e:mock
```

只读 live smoke tests 需要显式启用，目标仓库为 `https://gitcode.com/gcw_CSGJYRfL/test`：

```bash
GITCODE_LIVE=1 npm test
```

认证写入探针是单独的、偏 cleanup 的测试：

```bash
GITCODE_LIVE_WRITES=1 GITCODE_TOKEN=... npm test
```

真实仓库创建是单独的 opt-in E2E，因为它会创建并删除一个临时私有仓库：

```bash
GITCODE_LIVE_REPO_CREATE=1 GITCODE_TOKEN=... npm run test:e2e:live-repo
```

更多测试合同格式、mock server helper、mock git harness 和 live repo cleanup 行为，请看 [E2E testing framework](docs/e2e-testing.md)。

## 相关文档

- [项目定位](docs/project-positioning.md)
- [CHANGELOG](CHANGELOG.md)
- [`gh` compatibility matrix](docs/gh-compatibility-matrix.md)
- [Compatibility boundary](docs/gh-compatibility-boundary.md)
- [Agent skill](skills/gitcode-cli/SKILL.md)
- [E2E testing framework](docs/e2e-testing.md)

## English

[Back to Chinese](#gitcode-cli)

`gitcode-cli` is an automation-focused GitCode CLI for engineers and AI agents. It uses a GitHub CLI (`gh`)-like command shape to make repositories, issues, pull requests, files, releases, auth, JSON output, and browser handoff predictable from terminals, scripts, CI, and agent workflows.

[Quick Start](#quick-start) · [Install](#install) · [Authenticate](#authenticate) · [Agent Skill](#agent-skill-1) · [Daily Workflows](#daily-workflows) · [Testing](#testing) · [Back to Chinese](#gitcode-cli)

## Highlights

- `gh`-style commands: keep the familiar repo, issue, pr, release, and api mental model for GitHub CLI users.
- Agent-ready: ships a companion skill that guides agents toward stable JSON, explicit repository arguments, and safety checks.
- Automation-first: `--json`, `--jq`, `--template`, and `gc api` work well for scripts, CI, and agent reasoning.
- Low-surprise writes: high-risk operations such as merge, delete, and release cleanup require explicit `--yes` in non-interactive sessions.
- Composes with local git: transport actions such as clone, checkout, diff, and push use local `git`; platform objects go through the GitCode API.

## Quick Start

### Agent-assisted Install

If you want Codex or another coding agent to install this tool for you, paste this prompt into the agent:

```text
Please install and verify gitcode-cli in the current machine/development environment:
1. Check that Node.js and npm are available. Node.js must be >= 20.
2. Run `npm install -g @plm-cac/gitcode-cli`.
3. Verify `gc --version`, `gitcode --version`, and `gc --help`.
4. Run `gc skill status --json`, then run `gc skill install --yes` to install the companion Agent skill.
5. Run `gc skill status --json` again and report the result.
6. If GitCode login is needed, run `gc auth status`; do not ask me to paste a token into chat. Ask me to enter it interactively on my machine or set `GITCODE_TOKEN`.
```

You can also send the full install document to the agent: [Agent install prompt](docs/agent-install.md). After installation, agents can use `gc skill status --json` to verify the skill is ready, then prefer `--json` output, explicit repository arguments, and confirmation-aware mutation flows.

## What It Automates

| Area | Capability |
| --- | --- |
| Repository automation | View, clone, create, fork, and sync repositories, and save default repository context. |
| Issue / PR workflows | List, view, create, edit, comment, close, reopen, checkout, diff, and merge. |
| Files and releases | Browse repository files, view file content, and manage labels and releases. |
| Account and organization | Login, token status, organization repositories, members, and SSH keys. |
| JSON and scripts | Use `--json`, `--jq`, `--template`, and `gc api` for scripts and CI. |
| Agent-safe automation | Use `skills/gitcode-cli` to guide agents toward read-first flows, explicit confirmation, and stable JSON output. |
| Browser handoff | Use `gc browse` to open or print GitCode URLs for human-agent collaboration. |

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

Supported environment variable names are `GITCODE_TOKEN`, `GC_TOKEN`, and `GITCODE_ACCESS_TOKEN`. Saved credentials use the user config directory, and tokens are never embedded in git remotes.

## Agent Skill

The repository ships a first-class agent skill:

[`skills/gitcode-cli/SKILL.md`](skills/gitcode-cli/SKILL.md)

It nudges agents toward read-only commands first, stable JSON fields, and explicit repository arguments. It also documents when to prompt before mutating GitCode state, including `issue close`, `pr merge`, `ssh-key delete`, `label delete`, and `release delete`.

If the CLI is already installed, use the built-in installer:

```bash
gc skill status
gc skill install
```

If the skill was installed first, it instructs the agent to verify that `gc` or `gitcode` exists and ask the user to install `@plm-cac/gitcode-cli` before running GitCode commands.

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
gc pr merge 12 --squash --delete-branch --yes
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
gc release delete v1.0.0 --cleanup-tag --yes
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

## Compatibility Boundary

This CLI borrows `gh` command shapes where they make GitCode automation easier, but it does not promise byte-for-byte `gh` parity. Stable JSON output and GitCode API behavior take priority.

External commands named `gc-<name>` on `PATH` are treated as extensions. GitHub-only product areas without GitCode equivalents fail clearly, or should be implemented as external extensions only when GitCode has a stable automation workflow.

GitCode does not expose a release-only delete endpoint in the current release API. `gc release delete TAG` will fail with guidance when release-only deletion is unavailable; pass `--cleanup-tag --yes` to delete the tag that backs the release. Other destructive operations such as `gc pr merge`, `gc label delete`, and `gc ssh-key delete` also require `--yes` in non-interactive sessions.

See:

- [`gh` compatibility matrix](docs/gh-compatibility-matrix.md)
- [GitCode CLI compatibility boundary](docs/gh-compatibility-boundary.md)

## Testing

Default tests build the TypeScript project and use mock HTTP servers, so they do not mutate live GitCode data:

```bash
npm test
```

Mock-only E2E contracts can be run directly:

```bash
npm run test:e2e:mock
```

Read-only live smoke tests are opt-in and target `https://gitcode.com/gcw_CSGJYRfL/test`:

```bash
GITCODE_LIVE=1 npm test
```

Authenticated write probes are separate and cleanup-oriented:

```bash
GITCODE_LIVE_WRITES=1 GITCODE_TOKEN=... npm test
```

Live repository creation is a separate opt-in E2E because it creates and then deletes a real temporary private repository:

```bash
GITCODE_LIVE_REPO_CREATE=1 GITCODE_TOKEN=... npm run test:e2e:live-repo
```

See [E2E testing framework](docs/e2e-testing.md) for the contract case format, mock server helpers, mock git harness, and live repo cleanup behavior.

## Related Docs

- [Positioning decision](docs/project-positioning.md)
- [CHANGELOG](CHANGELOG.md)
- [`gh` compatibility matrix](docs/gh-compatibility-matrix.md)
- [Compatibility boundary](docs/gh-compatibility-boundary.md)
- [Agent skill](skills/gitcode-cli/SKILL.md)
- [E2E testing framework](docs/e2e-testing.md)
