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
    const body = bodyText ? JSON.parse(bodyText) : undefined;
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
  assert.match(help.stdout, /GitCode CLI/);

  const version = await run(["--version"]);
  assert.equal(version.code, 0);
  assert.match(version.stdout, /0\.1\.0/);

  const cwd = await mkdtemp(join(tmpdir(), "gitcode-cli-no-repo-"));
  const error = await run(["--json", "repo", "view"], { env: tempEnv({ GC_REPO: "" }), cwd });
  assert.equal(error.code, 1);
  assert.equal(JSON.parse(error.stdout).error.includes("Could not resolve repository"), true);
});

test("auth stores tokens and env tokens take precedence", async () => {
  const env = tempEnv();
  const login = await run(["auth", "login", "--with-token"], { env, input: "saved-token\n" });
  assert.equal(login.code, 0);
  assert.match(login.stdout, /Logged in/);

  const status = await run(["auth", "status", "--json"], { env });
  assert.equal(JSON.parse(status.stdout).tokenSource, "store");

  const token = await run(["auth", "token"], { env: { ...env, GITCODE_TOKEN: "env-token" } });
  assert.equal(token.stdout.trim(), "env-token");

  const logout = await run(["auth", "logout"], { env });
  assert.equal(logout.code, 0);
});

test("gc api resolves paths, sends auth, bodies, and paginates", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues" && req.search.get("page") === "2") return { body: [] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues") return { body: [{ number: 1, title: "one" }] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/pulls") return { body: { ok: true, title: req.body.title } };
    return { status: 404, body: { error: req.path } };
  }, async ({ base, requests }) => {
    const env = tempEnv({ GITCODE_API_BASE: base, GITCODE_TOKEN: "secret" });
    const list = await run(["api", "--paginate", "repos/gcw_CSGJYRfL/test/issues"], { env });
    assert.deepEqual(JSON.parse(list.stdout), [{ number: 1, title: "one" }]);
    assert.equal(requests[0].headers.authorization, "Bearer secret");
    assert.equal(requests[0].headers["private-token"], "secret");

    const post = await run(["api", "repos/gcw_CSGJYRfL/test/pulls", "-X", "POST", "-f", "title=hello"], { env });
    assert.equal(JSON.parse(post.stdout).title, "hello");
  });
});

test("repo resolver, repo view, default repo, and clone work", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test") return { body: { name: "test", full_name: "gcw_CSGJYRfL/test", default_branch: "main" } };
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
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/issues/8" && req.method === "PATCH") return { body: { number: 8, title: "new", state: req.body.state } };
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

    const merge = await run(["pr", "merge", "3", "-R", "gcw_CSGJYRfL/test", "--squash", "--delete-branch"], { env, cwd });
    assert.match(merge.stdout, /Merged pull request #3/);

    const checkout = await run(["pr", "checkout", "3", "-R", "gcw_CSGJYRfL/test"], { env, cwd });
    assert.equal(checkout.code, 0);
    assert.match(await readFile(gitLog, "utf8"), /fetch\norigin\nfeature:feature\ncheckout\nfeature/);
  });
});

test("label, release, search, and browse commands are wired", async () => {
  await withServer((req) => {
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/labels") return { body: [{ name: "bug", color: "ff0000" }] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/releases") return { body: [{ tag_name: "v1.0.0", name: "one" }] };
    if (req.path === "/api/v5/repos/gcw_CSGJYRfL/test/releases/v1.0.0") return { body: { tag_name: "v1.0.0", body: "notes" } };
    if (req.path === "/api/v5/search/repositories") return { body: { items: [{ full_name: "gcw_CSGJYRfL/test" }], q: req.search.get("q") } };
    return { status: 404, body: { error: req.path } };
  }, async ({ base }) => {
    const env = tempEnv({ GITCODE_API_BASE: base, GC_REPO: "gcw_CSGJYRfL/test" });
    assert.equal(JSON.parse((await run(["label", "list", "--json", "name"], { env })).stdout)[0].name, "bug");
    assert.equal(JSON.parse((await run(["release", "list", "--json", "tagName"], { env })).stdout)[0].tagName, "v1.0.0");
    assert.match((await run(["release", "view", "v1.0.0"], { env })).stdout, /notes/);
    assert.equal(JSON.parse((await run(["search", "repos", "hello"], { env })).stdout).q, "hello");
    assert.equal((await run(["browse", "issues/7"], { env })).stdout.trim(), "https://gitcode.com/gcw_CSGJYRfL/test/issues/7");
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
