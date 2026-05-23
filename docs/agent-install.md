# Agent Install Prompt

Copy this prompt into Codex or another coding agent when you want it to install
`gitcode-cli` for you.

## 中文 Prompt

```text
请在当前电脑/开发环境中安装并验证 gitcode-cli。

目标：
1. 安装 npm 包 @plm-cac/gitcode-cli。
2. 确认 `gc` 和 `gitcode` 命令可用。
3. 安装配套 Agent skill，让后续 Agent 能安全、稳定地使用 `gc`。
4. 验证安装结果，并告诉我最终状态。

请按下面流程执行：

1. 检查 Node.js 和 npm 是否可用，Node.js 需要 >= 20。
2. 运行：
   npm install -g @plm-cac/gitcode-cli
3. 验证：
   gc --version
   gitcode --version
   gc --help
4. 安装配套 skill：
   gc skill status --json
   gc skill install --yes
   gc skill status --json
5. 如果需要访问我的 GitCode 账号，先检查：
   gc auth status
   不要要求我在聊天中粘贴 Token。请让我在本机交互输入，或让我通过环境变量设置 GITCODE_TOKEN。

约束：
- 如果全局 npm 安装因为权限失败，请不要反复重试破坏性命令；请告诉我推荐的修复方式，例如配置 npm global prefix、使用 node 版本管理器，或让我确认是否使用 sudo。
- 不要把 Token 写入 git remote。
- 不要修改当前项目文件，除非我明确要求。
- 最后请汇报 `gc --version`、`gc skill status --json` 的结果，以及是否还需要我登录 GitCode。
```

## English Prompt

```text
Please install and verify gitcode-cli in the current machine/development environment.

Goals:
1. Install the npm package @plm-cac/gitcode-cli.
2. Confirm that the `gc` and `gitcode` commands are available.
3. Install the companion Agent skill so future agents can use `gc` safely and reliably.
4. Verify the final installation status and report it back to me.

Follow this flow:

1. Check that Node.js and npm are available. Node.js must be >= 20.
2. Run:
   npm install -g @plm-cac/gitcode-cli
3. Verify:
   gc --version
   gitcode --version
   gc --help
4. Install the companion skill:
   gc skill status --json
   gc skill install --yes
   gc skill status --json
5. If GitCode account access is needed, check:
   gc auth status
   Do not ask me to paste a token into chat. Ask me to enter it interactively on my machine, or ask me to set GITCODE_TOKEN as an environment variable.

Constraints:
- If global npm installation fails because of permissions, do not repeatedly retry destructive commands. Tell me the recommended fix, such as configuring npm global prefix, using a Node version manager, or asking me whether sudo is acceptable.
- Do not write tokens into git remotes.
- Do not modify files in the current project unless I explicitly ask you to.
- At the end, report the output of `gc --version`, `gc skill status --json`, and whether I still need to log in to GitCode.
```
