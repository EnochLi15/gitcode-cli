import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { test } from "node:test";
import { isolatedEnv, runCli, tempWorkspace } from "./helpers/cliRunner.mjs";
import { createMockGit } from "./helpers/mockGit.mjs";
import { withMockGitCodeServer } from "./helpers/mockGitcodeServer.mjs";

test("repo clone and sync delegate transport work to git", async () => {
  const cwd = await tempWorkspace("gitcode-repo-git-e2e-");
  const git = await createMockGit(cwd, { branch: "main" });
  const env = isolatedEnv({ GITCODE_GIT_BIN: git.bin });

  const clone = await runCli(["repo", "clone", "OWNER/REPO", "checkout", "--", "--depth", "1"], { cwd, env });
  assert.equal(clone.code, 0, clone.stderr);

  const sync = await runCli(["repo", "sync", "upstream"], { cwd, env });
  assert.equal(sync.code, 0, sync.stderr);

  assert.match(await git.log(), /clone\nhttps:\/\/gitcode.com\/OWNER\/REPO.git\ncheckout\n--depth\n1[\s\S]*fetch\nupstream[\s\S]*pull\n--ff-only\nupstream/);
});

test("pr checkout and diff compose API metadata with git commands", async () => {
  await withMockGitCodeServer((req) => {
    if (req.method === "GET" && req.path === "/api/v5/repos/OWNER/REPO/pulls/7") {
      return { body: { number: 7, title: "pr", base: { ref: "main" }, head: { ref: "feature" } } };
    }
    return { status: 404, body: { error: req.path } };
  }, async ({ base }) => {
    const cwd = await tempWorkspace("gitcode-pr-git-e2e-");
    await mkdir(`${cwd}/.git`, { recursive: true });
    const git = await createMockGit(cwd, { branch: "feature" });
    const env = isolatedEnv({ GITCODE_API_BASE: base, GITCODE_GIT_BIN: git.bin });

    const checkout = await runCli(["pr", "checkout", "7", "-R", "OWNER/REPO"], { cwd, env });
    assert.equal(checkout.code, 0, checkout.stderr);

    const diff = await runCli(["pr", "diff", "7", "-R", "OWNER/REPO", "--name-only"], { cwd, env });
    assert.equal(diff.code, 0, diff.stderr);

    assert.match(await git.log(), /fetch\norigin\nfeature:feature[\s\S]*checkout\nfeature[\s\S]*diff\n--name-only\nmain\.\.\.feature/);
  });
});

test("pr status combines current branch with pull request search", async () => {
  await withMockGitCodeServer((req) => {
    if (req.method === "GET" && req.path === "/api/v5/repos/OWNER/REPO/pulls") {
      assert.equal(req.query.head, "feature");
      assert.equal(req.query.state, "open");
      return { body: [{ number: 7, title: "branch pr", state: "open", base: { ref: "main" }, head: { ref: "feature" } }] };
    }
    return { status: 404, body: { error: req.path } };
  }, async ({ base }) => {
    const cwd = await tempWorkspace("gitcode-pr-status-e2e-");
    await mkdir(`${cwd}/.git`, { recursive: true });
    const git = await createMockGit(cwd, { branch: "feature" });
    const result = await runCli(["pr", "status", "-R", "OWNER/REPO"], {
      cwd,
      env: isolatedEnv({ GITCODE_API_BASE: base, GITCODE_GIT_BIN: git.bin })
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /#7\s+open\s+feature -> main\s+branch pr/);
  });
});

test("workflow init composes GitCode repo creation with local git commands", async () => {
  await withMockGitCodeServer((req) => {
    if (req.method === "POST" && req.path === "/api/v5/user/repos") {
      assert.equal(req.body.name, "contract-repo");
      return { body: { name: "contract-repo", full_name: "me/contract-repo" } };
    }
    return { status: 404, body: { error: req.path } };
  }, async ({ base }) => {
    const cwd = await tempWorkspace("gitcode-workflow-e2e-");
    await mkdir(`${cwd}/.git`, { recursive: true });
    const git = await createMockGit(cwd, { branch: "main", remoteUrl: "https://gitcode.com/me/contract-repo.git" });
    const result = await runCli(["workflow", "init", "--name", "contract-repo", "--commit-message", "Initial commit"], {
      cwd,
      env: isolatedEnv({ GITCODE_API_BASE: base, GITCODE_TOKEN: "contract-token", GITCODE_GIT_BIN: git.bin })
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(await git.log(), /remote\nadd\norigin\nhttps:\/\/gitcode.com\/me\/contract-repo.git[\s\S]*commit\n-m\nInitial commit[\s\S]*push\n--set-upstream\norigin\nmain/);
  });
});

test("workflow diff delegates staged diff flags to git", async () => {
  const cwd = await tempWorkspace("gitcode-workflow-diff-e2e-");
  const git = await createMockGit(cwd, { branch: "main" });
  const result = await runCli(["workflow", "diff", "--staged", "--name-only"], {
    cwd,
    env: isolatedEnv({ GITCODE_GIT_BIN: git.bin })
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(await git.log(), /diff\n--name-only\n--cached/);
});

test("workflow push validates the GitCode remote and pushes current branch", async () => {
  const cwd = await tempWorkspace("gitcode-workflow-push-e2e-");
  const git = await createMockGit(cwd, {
    branch: "main",
    remoteUrl: "https://gitcode.com/OWNER/REPO.git",
    remoteExists: true,
    status: " M README.md"
  });
  const result = await runCli(["workflow", "push", "--set-upstream"], {
    cwd,
    env: isolatedEnv({ GITCODE_GIT_BIN: git.bin })
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /uncommitted changes/);
  assert.match(await git.log(), /remote\nget-url\norigin[\s\S]*status\n--porcelain[\s\S]*push\n--set-upstream\norigin\nmain/);
});
