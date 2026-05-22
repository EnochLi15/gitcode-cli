import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";

const cli = join(process.cwd(), "dist/cli.js");

async function run(args, options = {}) {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (options.input) child.stdin.write(options.input);
  child.stdin.end();
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const code = await new Promise((resolve) => child.on("close", resolve));
  return {
    code,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8")
  };
}

async function withServer(handler, fn) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    await new Promise((resolve) => req.on("end", resolve));
    const bodyText = Buffer.concat(chunks).toString("utf8");
    let body;
    if (bodyText) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        body = bodyText;
      }
    }
    const url = new URL(req.url, "http://127.0.0.1");
    const record = { method: req.method, path: url.pathname, search: url.searchParams, headers: req.headers, body };
    requests.push(record);
    const response = await handler(record);
    res.statusCode = response.status ?? 200;
    for (const [key, value] of Object.entries(response.headers ?? {})) res.setHeader(key, value);
    const payload = response.body === undefined ? "" : JSON.stringify(response.body);
    if (payload) res.setHeader("content-type", "application/json");
    res.end(payload);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await fn({ base: `http://127.0.0.1:${port}/api/v5`, requests });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function tempEnv(extra = {}) {
  return {
    GITCODE_CONFIG_DIR: join(tmpdir(), `gitcode-cli-test-${Date.now()}-${Math.random()}`),
    GITCODE_NO_BROWSER: "1",
    ...extra
  };
}

test("gc help/version and JSON errors are stable", async () => {
  const help = await run(["repo", "--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Usage: gc repo/);
  assert.match(help.stdout, /--json name,defaultBranchRef/);

  const workflowHelp = await run(["workflow", "--help"]);
  assert.equal(workflowHelp.code, 0);
  assert.match(workflowHelp.stdout, /gc workflow push --set-upstream/);

  const version = await run(["--version"]);
  assert.equal(version.code, 0);
  assert.match(version.stdout, /0\.1\.0/);

  const cwd = await mkdtemp(join(tmpdir(), "gitcode-cli-no-repo-"));
  const error = await run(["--json", "repo", "view"], { env: tempEnv({ GC_REPO: "" }), cwd });
  assert.equal(error.code, 1);
  assert.equal(JSON.parse(error.stdout).error.includes("Could not resolve repository"), true);
});

test("auth validates interactive and stdin tokens, and env tokens take precedence", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/user" && req.headers.authorization === "Bearer saved-token") return { body: { login: "me" } };
    if (req.path === "/api/v5/user" && req.headers.authorization === "Bearer interactive-token") return { body: { login: "me" } };
    if (req.path === "/api/v5/user") return { status: 401, body: { message: "bad token" } };
    return { status: 404, body: {} };
  }, async ({ base }) => {
    const env = tempEnv({ GITCODE_API_BASE: base });
    const login = await run(["auth", "login", "--with-token"], { env, input: "saved-token\n" });
    assert.equal(login.code, 0);
    assert.match(login.stdout, /Logged in/);

    const status = await run(["auth", "status", "--json"], { env });
    assert.equal(JSON.parse(status.stdout).tokenSource, "store");

    const token = await run(["auth", "token"], { env: { ...env, GITCODE_TOKEN: "env-token" } });
    assert.equal(token.stdout.trim(), "env-token");

    const interactiveEnv = tempEnv({ GITCODE_API_BASE: base });
    const interactive = await run(["auth", "login"], { env: interactiveEnv, input: "interactive-token\n" });
    assert.equal(interactive.code, 0);
    assert.match(interactive.stderr, /GitCode token/);

    const invalid = await run(["auth", "login", "--with-token"], { env: tempEnv({ GITCODE_API_BASE: base }), input: "bad-token\n" });
    assert.equal(invalid.code, 1);
    assert.match(invalid.stderr, /token validation/);

    const logout = await run(["auth", "logout"], { env });
    assert.equal(logout.code, 0);
  });
});

test("human errors can be localized while JSON errors stay stable", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gitcode-cli-locale-"));
  const zh = await run(["repo", "view"], { env: tempEnv({ GC_REPO: "", GITCODE_LANG: "zh-CN" }), cwd });
  assert.equal(zh.code, 1);
  assert.match(zh.stderr, /无法确定仓库/);

  const json = await run(["--json", "repo", "view"], { env: tempEnv({ GC_REPO: "", GITCODE_LANG: "zh-CN" }), cwd });
  assert.equal(json.code, 1);
  assert.match(JSON.parse(json.stdout).error, /Could not resolve repository/);
});

test("gc api resolves paths, sends auth, bodies, and paginates", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues" && req.search.get("page") === "2") return { body: [] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues") return { body: [{ number: 1, title: "one" }] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/pulls") return { body: { ok: true, title: req.body.title } };
    if (req.path === "/api/v5/needs-token" && req.search.get("access_token") === "secret") return { body: { ok: true } };
    if (req.path === "/api/v5/needs-token") return { status: 403, body: { message: "requires access_token" } };
    return { status: 404, body: { error: req.path } };
  }, async ({ base, requests }) => {
    const env = tempEnv({ GITCODE_API_BASE: base, GITCODE_TOKEN: "secret" });
    const list = await run(["api", "--paginate", "repos/gcw_CSGJYRfL/test/issues"], { env });
    assert.deepEqual(JSON.parse(list.stdout), [{ number: 1, title: "one" }]);
    assert.equal(requests[0].headers.authorization, "Bearer secret");
    assert.equal(requests[0].headers["private-token"], "secret");

    const post = await run(["api", "repos/gcw_CSGJYRfL/test/pulls", "-X", "POST", "-f", "title=hello"], { env });
    assert.equal(JSON.parse(post.stdout).title, "hello");

    const fallback = await run(["api", "needs-token"], { env });
    assert.equal(JSON.parse(fallback.stdout).ok, true);
  });
});

test("repo resolver, repo view, default repo, and clone work", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test") return { body: { name: "test", full_name: "gcw_CSGJYRfL/test", default_branch: "main" } };
    if (req.path === "/api/v5/users/gcw_CSGJYRfL/repos") return { body: [{ name: "test", full_name: "gcw_CSGJYRfL/test" }] };
    if (req.path === "/api/v5/user/repos" && req.method === "POST") return { body: { name: req.body.name, full_name: `me/${req.body.name}` } };
    return { status: 404, body: {} };
  }, async ({ base }) => {
    const cwd = await mkdtemp(join(tmpdir(), "gitcode-cli-repo-"));
    const env = tempEnv({ GITCODE_API_BASE: base });
    const view = await run(["repo", "view", "-R", "gitcode.com/gcw_CSGJYRfL/test", "--json", "name,defaultBranchRef"], { env, cwd });
    assert.deepEqual(JSON.parse(view.stdout), { name: "test", defaultBranchRef: "main" });

    const setDefault = await run(["repo", "set-default", "gcw_CSGJYRfL/test"], { env, cwd });
    assert.equal(setDefault.code, 0);
    const defaultView = await run(["repo", "view", "--json", "fullName"], { env, cwd });
    assert.deepEqual(JSON.parse(defaultView.stdout), { fullName: "gcw_CSGJYRfL/test" });

    const gitLog = join(cwd, "git-args.txt");
    const gitMock = join(cwd, "git-mock.sh");
    await writeFile(gitMock, `#!/bin/sh\nprintf '%s\\n' "$@" > "${gitLog}"\n`, "utf8");
    await chmod(gitMock, 0o755);
    const clone = await run(["repo", "clone", "gcw_CSGJYRfL/test", "checkout", "--", "--depth", "1"], { env: { ...env, GITCODE_GIT_BIN: gitMock }, cwd });
    assert.equal(clone.code, 0);
    assert.match(await readFile(gitLog, "utf8"), /clone\nhttps:\/\/gitcode.com\/gcw_CSGJYRfL\/test.git\ncheckout\n--depth\n1/);

    const repos = await run(["repo", "list", "gcw_CSGJYRfL", "--json", "fullName"], { env, cwd });
    assert.deepEqual(JSON.parse(repos.stdout), [{ fullName: "gcw_CSGJYRfL/test" }]);

    const created = await run(["repo", "create", "sandbox", "--private", "--json", "fullName"], { env: { ...env, GITCODE_TOKEN: "secret" }, cwd });
    assert.deepEqual(JSON.parse(created.stdout), { fullName: "me/sandbox" });
  });
});

test("issue read and write workflows use normalized output and payloads", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues" && req.method === "GET") {
      assert.equal(req.search.get("state"), "open");
      assert.equal(req.search.get("labels"), "bug");
      return { body: [{ number: 7, title: "bug", state: "open", user: { login: "me" } }] };
    }
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues/7" && req.method === "GET") return { body: { number: 7, title: "bug", state: "open" } };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues/7/comments" && req.method === "GET") return { body: [{ body: "note" }] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues/7/pull_requests") return { body: [] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues" && req.method === "POST") return { body: { number: 8, title: req.body.title, state: "open" } };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues/8" && req.method === "PATCH") {
      assert.equal(req.body.state, "close");
      return { body: { number: 8, title: "new", state: "closed" } };
    }
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues/8/comments" && req.method === "POST") return { body: { body: req.body.body } };
    return { status: 404, body: { error: req.path } };
  }, async ({ base, requests }) => {
    const env = tempEnv({ GITCODE_API_BASE: base, GITCODE_TOKEN: "secret" });
    const list = await run(["issue", "list", "-R", "gcw_CSGJYRfL/test", "--state", "open", "--label", "bug", "--json", "number,title"], { env });
    assert.deepEqual(JSON.parse(list.stdout), [{ number: 7, title: "bug" }]);

    const view = await run(["issue", "view", "7", "-R", "gcw_CSGJYRfL/test", "--comments", "--json", "number,comments"], { env });
    assert.equal(JSON.parse(view.stdout).comments[0].body, "note");

    const created = await run(["issue", "create", "-R", "gcw_CSGJYRfL/test", "--title", "new", "--body", "body"], { env });
    assert.match(created.stdout, /Created issue #8/);
    assert.equal(requests.find((req) => req.method === "POST" && req.path.endsWith("/issues")).body.body, "body");

    const closed = await run(["issue", "close", "8", "-R", "gcw_CSGJYRfL/test", "--comment", "done"], { env });
    assert.match(closed.stdout, /Closed issue #8/);
  });
});

test("write requests retry as form data when GitCode rejects JSON bodies", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/labels" && req.method === "POST") {
      if ((req.headers["content-type"] ?? "").includes("application/json")) return { status: 400, body: { error_message: "the name, color are missing, at least one parameter must be provided" } };
      return { body: { name: "live-e2e", color: "336699", description: "ok" } };
    }
    return { status: 404, body: { error: req.path } };
  }, async ({ base, requests }) => {
    const env = tempEnv({ GITCODE_API_BASE: base, GITCODE_TOKEN: "secret" });
    const label = await run(["label", "create", "live-e2e", "--color", "336699", "--description", "ok", "-R", "gcw_CSGJYRfL/test", "--json", "name,color"], { env });
    assert.deepEqual(JSON.parse(label.stdout), { name: "live-e2e", color: "336699" });
    assert.equal(requests.length, 2);
    assert.match(requests[1].headers["content-type"], /application\/x-www-form-urlencoded/);
  });
});

test("pull request workflows cover read, write, merge, local git, jq, and templates", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/pulls" && req.method === "GET") return { body: [{ number: 3, title: "pr", state: "open", base: { ref: "main" }, head: { ref: "feature" } }] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/pulls/3" && req.method === "GET") return { body: { number: 3, title: "pr", state: "open", base: { ref: "main" }, head: { ref: "feature" } } };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/pulls/3/comments") return { body: [{ body: "hello" }] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/pulls" && req.method === "POST") return { body: { number: 4, title: req.body.title, base: { ref: req.body.base }, head: { ref: req.body.head } } };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/pulls/3/merge") return { body: { number: 3, title: "pr", state: "merged", head: { ref: "feature" } } };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/branches/feature") return { body: {} };
    return { status: 404, body: { error: req.path } };
  }, async ({ base }) => {
    const cwd = await mkdtemp(join(tmpdir(), "gitcode-cli-pr-"));
    await mkdir(join(cwd, ".git"), { recursive: true });
    const gitLog = join(cwd, "git-args.txt");
    const gitMock = join(cwd, "git-mock.sh");
    await writeFile(gitMock, `#!/bin/sh\nprintf '%s\\n' "$@" >> "${gitLog}"\nif [ "$1" = "branch" ]; then echo feature; fi\n`, "utf8");
    await chmod(gitMock, 0o755);
    const env = tempEnv({ GITCODE_API_BASE: base, GITCODE_TOKEN: "secret", GITCODE_GIT_BIN: gitMock });

    const list = await run(["pr", "list", "-R", "gcw_CSGJYRfL/test", "--json", "number,title", "--jq", ".[0].title"], { env, cwd });
    assert.equal(JSON.parse(list.stdout), "pr");

    const missing = await run(["pr", "list", "-R", "gcw_CSGJYRfL/test", "--json", "number,title", "--jq", ".[1].title"], { env, cwd });
    assert.equal(JSON.parse(missing.stdout), null);

    const templated = await run(["pr", "list", "-R", "gcw_CSGJYRfL/test", "--template", "{{range .}}#{{.number}} {{.title}}\n{{end}}"], { env, cwd });
    assert.equal(templated.stdout.trim(), "#3 pr");

    const view = await run(["pr", "view", "3", "-R", "gcw_CSGJYRfL/test", "--comments", "--json", "comments"], { env, cwd });
    assert.equal(JSON.parse(view.stdout).comments[0].body, "hello");

    const create = await run(["pr", "create", "-R", "gcw_CSGJYRfL/test", "--title", "new", "--base", "main", "--head", "feature"], { env, cwd });
    assert.match(create.stdout, /Created pull request #4/);

    const review = await run(["pr", "review", "3", "-R", "gcw_CSGJYRfL/test", "--body", "looks fine"], { env, cwd });
    assert.match(review.stdout, /Reviewed pull request #3/);

    const merge = await run(["pr", "merge", "3", "-R", "gcw_CSGJYRfL/test", "--squash", "--delete-branch"], { env, cwd });
    assert.match(merge.stdout, /Merged pull request #3/);

    const checkout = await run(["pr", "checkout", "3", "-R", "gcw_CSGJYRfL/test"], { env, cwd });
    assert.equal(checkout.code, 0);
    assert.match(await readFile(gitLog, "utf8"), /fetch\norigin\nfeature:feature\ncheckout\nfeature/);
  });
});

test("file browsing commands list, view, JSON, and missing file errors", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/contents/src") return { body: [{ name: "index.ts", path: "src/index.ts", type: "file", size: 12 }] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/contents/README.md") return { body: { name: "README.md", path: "README.md", type: "file", encoding: "base64", content: Buffer.from("# Hello\n").toString("base64") } };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/contents/missing.md") return { status: 404, body: { message: "not found" } };
    return { status: 404, body: { error: req.path } };
  }, async ({ base }) => {
    const env = tempEnv({ GITCODE_API_BASE: base, GC_REPO: "gcw_CSGJYRfL/test" });
    const list = await run(["file", "list", "src", "--json", "path,type"], { env });
    assert.deepEqual(JSON.parse(list.stdout), [{ path: "src/index.ts", type: "file" }]);

    const view = await run(["file", "view", "README.md"], { env });
    assert.equal(view.stdout, "# Hello\n\n");

    const missing = await run(["file", "view", "missing.md"], { env });
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /Check the repository/);
  });
});

test("org and ssh-key commands cover happy paths and permission failures", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/user/orgs") return { body: [{ login: "gcw_CSGJYRfL", name: "Org" }] };
    if (req.path === "/api/v5/orgs/gcw_CSGJYRfL") return { body: { login: "gcw_CSGJYRfL", description: "demo" } };
    if (req.path === "/api/v5/orgs/gcw_CSGJYRfL/repos") return { body: [{ name: "test", full_name: "gcw_CSGJYRfL/test" }] };
    if (req.path === "/api/v5/orgs/gcw_CSGJYRfL/members") return { status: 403, body: { message: "forbidden" } };
    if (req.path === "/api/v5/user/keys" && req.method === "GET") return { body: [{ id: 1, title: "laptop" }] };
    if (req.path === "/api/v5/user/keys" && req.method === "POST") return { body: { id: 2, title: req.body.title, key: req.body.key } };
    if (req.path === "/api/v5/user/keys/2" && req.method === "DELETE") return { body: {} };
    return { status: 404, body: { error: req.path } };
  }, async ({ base }) => {
    const env = tempEnv({ GITCODE_API_BASE: base, GITCODE_TOKEN: "secret" });
    assert.equal(JSON.parse((await run(["org", "list", "--json", "login"], { env })).stdout)[0].login, "gcw_CSGJYRfL");
    assert.match((await run(["org", "view", "gcw_CSGJYRfL"], { env })).stdout, /demo/);
    assert.equal(JSON.parse((await run(["org", "repos", "gcw_CSGJYRfL", "--json", "fullName"], { env })).stdout)[0].fullName, "gcw_CSGJYRfL/test");
    const denied = await run(["org", "members", "gcw_CSGJYRfL"], { env });
    assert.equal(denied.code, 1);
    assert.match(denied.stderr, /Check your token permissions/);

    assert.equal(JSON.parse((await run(["ssh-key", "list", "--json", "id,title"], { env })).stdout)[0].title, "laptop");
    const added = await run(["ssh-key", "add", "--title", "desktop", "--key", "ssh-ed25519 AAA"], { env });
    assert.match(added.stdout, /Added SSH key desktop/);
    const deleted = await run(["ssh-key", "delete", "2"], { env });
    assert.match(deleted.stdout, /Deleted SSH key 2/);
  });
});

test("workflow helpers use mocked git and API behavior", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/user/repos" && req.method === "POST") return { body: { name: req.body.name, full_name: `me/${req.body.name}` } };
    return { status: 404, body: { error: req.path } };
  }, async ({ base }) => {
    const cwd = await mkdtemp(join(tmpdir(), "gitcode-cli-workflow-"));
    const gitLog = join(cwd, "git-args.txt");
    const gitMock = join(cwd, "git-mock.sh");
    await writeFile(gitMock, `#!/bin/sh
printf '%s\\n' "$@" >> "${gitLog}"
if [ "$1" = "remote" ] && [ "$2" = "get-url" ]; then
  if [ "$3" = "origin" ] && [ -f "${join(cwd, "remote-added")}" ]; then echo "https://gitcode.com/me/demo.git"; exit 0; fi
  exit 1
fi
if [ "$1" = "remote" ] && [ "$2" = "add" ]; then touch "${join(cwd, "remote-added")}"; fi
if [ "$1" = "branch" ]; then echo main; fi
if [ "$1" = "status" ]; then echo " M README.md"; fi
`, "utf8");
    await chmod(gitMock, 0o755);
    const env = tempEnv({ GITCODE_API_BASE: base, GITCODE_TOKEN: "secret", GITCODE_GIT_BIN: gitMock });

    const init = await run(["workflow", "init", "--name", "demo", "--commit-message", "Initial commit"], { env, cwd });
    assert.equal(init.code, 0);
    const push = await run(["workflow", "push", "--set-upstream"], { env, cwd });
    assert.equal(push.code, 0);
    assert.match(push.stderr, /uncommitted changes/);
    const diff = await run(["workflow", "diff", "--staged", "--name-only"], { env, cwd });
    assert.equal(diff.code, 0);
    assert.match(await readFile(gitLog, "utf8"), /init[\s\S]*remote\nadd\norigin\nhttps:\/\/gitcode.com\/me\/demo.git[\s\S]*commit\n-m\nInitial commit[\s\S]*push\n--set-upstream\norigin\nmain[\s\S]*diff\n--name-only\n--cached/);
  });
});

test("label, release, search, and browse commands are wired", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/labels") return { body: [{ name: "bug", color: "ff0000" }] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/releases" && req.method === "POST") return { body: { tag_name: req.body.tag_name, name: req.body.name, body: req.body.body } };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/releases") return { body: [{ tag_name: "v1.0.0", name: "one" }] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/releases/v1.0.0") return { body: { tag_name: "v1.0.0", body: "notes" } };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/releases/v2.0.0" && req.method === "DELETE") return { status: 405, body: { error_message: "Request method 'DELETE' not supported" } };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/tags/v2.0.0" && req.method === "DELETE") return { body: {} };
    if (req.path === "/api/v5/search/repositories") return { body: { items: [{ full_name: "gcw_CSGJYRfL/test" }], q: req.search.get("q") } };
    if (req.path === "/api/v5/search/issues") return { body: { items: [{ number: 7, title: "seeded issue" }], state: req.search.get("state") } };
    return { status: 404, body: { error: req.path } };
  }, async ({ base }) => {
    const env = tempEnv({ GITCODE_API_BASE: base, GC_REPO: "gcw_CSGJYRfL/test", GITCODE_TOKEN: "secret" });
    assert.equal(JSON.parse((await run(["label", "list", "--json", "name"], { env })).stdout)[0].name, "bug");
    assert.equal(JSON.parse((await run(["release", "list", "--json", "tagName"], { env })).stdout)[0].tagName, "v1.0.0");
    assert.match((await run(["release", "view", "v1.0.0"], { env })).stdout, /notes/);
    assert.equal(JSON.parse((await run(["release", "create", "v2.0.0", "--title", "two", "--notes", "notes", "--json", "tagName"], { env })).stdout).tagName, "v2.0.0");
    assert.match((await run(["release", "delete", "v2.0.0"], { env })).stdout, /Deleted release/);
    assert.equal(JSON.parse((await run(["search", "repos", "hello", "--json"], { env })).stdout)[0].fullName, "gcw_CSGJYRfL/test");
    assert.equal(JSON.parse((await run(["search", "issues", "seeded", "--state", "open", "--json", "title"], { env })).stdout)[0].title, "seeded issue");
    assert.equal((await run(["browse", "issues/7"], { env })).stdout.trim(), "https://gitcode.com/gcw_CSGJYRfL/test/issues/7");
    assert.equal((await run(["browse", "branch/main"], { env })).stdout.trim(), "https://gitcode.com/gcw_CSGJYRfL/test/tree/main");
  });
});

test("config, aliases, completion, and extension hooks work", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues") return { body: [] };
    return { status: 404, body: {} };
  }, async ({ base }) => {
    const cwd = await mkdtemp(join(tmpdir(), "gitcode-cli-config-"));
    const env = tempEnv({ GITCODE_API_BASE: base, GC_REPO: "gcw_CSGJYRfL/test" });

    const set = await run(["config", "set", "pager", "false"], { env, cwd });
    assert.equal(set.code, 0);
    const get = await run(["config", "get", "pager", "--json"], { env, cwd });
    assert.equal(JSON.parse(get.stdout), false);

    const alias = await run(["alias", "set", "bugs", "issue list --state open"], { env, cwd });
    assert.equal(alias.code, 0);
    const expanded = await run(["bugs", "--json"], { env, cwd });
    assert.deepEqual(JSON.parse(expanded.stdout), []);

    const completion = await run(["completion", "bash"], { env, cwd });
    assert.match(completion.stdout, /complete -F _gc_completion/);

    const extension = join(cwd, "gc-hello");
    await writeFile(extension, "#!/bin/sh\necho extension:$1\n", "utf8");
    await chmod(extension, 0o755);
    const ext = await run(["hello", "world"], { env: { ...env, PATH: `${cwd}:${process.env.PATH}` }, cwd });
    assert.equal(ext.stdout.trim(), "extension:world");
  });
});

test("live GitCode smoke tests are opt-in and read-only", { skip: process.env.GITCODE_LIVE !== "1" }, async () => {
  const env = tempEnv({ GITCODE_API_BASE: process.env.GITCODE_API_BASE ?? "https://api.gitcode.com/api/v5" });
  if (process.env.GITCODE_TOKEN || process.env.GC_TOKEN || process.env.GITCODE_ACCESS_TOKEN) {
    const repo = await run(["repo", "view", "-R", "gcw_CSGJYRfL/test", "--json", "fullName"], { env });
    assert.equal(repo.code, 0);
  }
  const issues = await run(["issue", "list", "-R", "gcw_CSGJYRfL/test", "--state", "open", "--json"], { env });
  assert.equal(issues.code, 0);
  const prs = await run(["pr", "list", "-R", "gcw_CSGJYRfL/test", "--state", "open", "--json"], { env });
  assert.equal(prs.code, 0);
  const releases = await run(["release", "list", "-R", "gcw_CSGJYRfL/test", "--json"], { env });
  assert.equal(releases.code, 0);
});

test("authenticated GitCode sandbox writes are opt-in and cleanup-oriented", { skip: process.env.GITCODE_LIVE_WRITES !== "1" }, async (t) => {
  if (!(process.env.GITCODE_TOKEN || process.env.GC_TOKEN || process.env.GITCODE_ACCESS_TOKEN)) {
    t.skip("GITCODE_LIVE_WRITES requires a GitCode token");
    return;
  }
  const marker = `gc-cli-live-${Date.now()}`;
  const env = tempEnv({ GITCODE_API_BASE: process.env.GITCODE_API_BASE ?? "https://api.gitcode.com/api/v5" });
  const create = await run(["label", "create", marker, "-R", "gcw_CSGJYRfL/test", "--color", "336699", "--description", "temporary live test label"], { env });
  if (create.code !== 0) {
    t.skip(`GitCode label write endpoint unavailable or token lacks permission: ${create.stderr || create.stdout}`);
    return;
  }
  const edit = await run(["label", "edit", marker, "-R", "gcw_CSGJYRfL/test", "--new-name", `${marker}-edited`, "--color", "669933"], { env });
  assert.equal(edit.code, 0);
  const remove = await run(["label", "delete", `${marker}-edited`, "-R", "gcw_CSGJYRfL/test"], { env });
  assert.equal(remove.code, 0);
});
