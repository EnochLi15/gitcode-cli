const repo = "OWNER/REPO";
const repoPath = "/api/v5/repos/OWNER/REPO";

export const ghContractCases = [
  {
    name: "auth login stores a host token that auth status can read",
    env: { GITCODE_TOKEN: "", GC_TOKEN: "", GITCODE_ACCESS_TOKEN: "" },
    setup: [
      {
        argv: ["auth", "login", "--with-token"],
        input: "contract-token\n",
        expect: { code: 0, stdoutIncludes: "Logged in" }
      }
    ],
    argv: ["auth", "status", "--json"],
    requests: [
      {
        method: "GET",
        path: "/api/v5/user",
        headers: { authorization: "Bearer contract-token" },
        response: { login: "contract-user" }
      }
    ],
    expect: { code: 0, stdoutJson: { hostname: "gitcode.com", tokenSource: "store" }, stderr: "" }
  },
  {
    name: "api supports pagination with bearer and private-token auth headers",
    argv: ["api", "--paginate", `${repoPath.slice("/api/v5/".length)}/issues`],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      {
        method: "GET",
        path: `${repoPath}/issues`,
        headers: { authorization: "Bearer contract-token", "private-token": "contract-token" },
        response: [{ number: 1, title: "one" }]
      },
      {
        method: "GET",
        path: `${repoPath}/issues`,
        query: { page: "2" },
        response: []
      }
    ],
    expect: { code: 0, stdoutJson: [{ number: 1, title: "one" }], stderr: "" }
  },
  {
    name: "api sends JSON bodies from -f and retries access_token fallback",
    argv: ["api", "needs-token", "-X", "POST", "-f", "title=hello"],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      {
        method: "POST",
        path: "/api/v5/needs-token",
        headers: { authorization: "Bearer contract-token", "private-token": "contract-token" },
        body: { title: "hello" },
        status: 403,
        response: { message: "requires access_token" }
      },
      {
        method: "POST",
        path: "/api/v5/needs-token",
        query: { access_token: "contract-token" },
        body: { title: "hello" },
        response: { ok: true }
      }
    ],
    expect: { code: 0, stdoutJson: { ok: true }, stderr: "" }
  },
  {
    name: "api supports --input JSON files and -F file fields",
    files: [
      { path: "payload.json", content: "{\"title\":\"from-input\"}\n" },
      { path: "body.txt", content: "from file field\n" }
    ],
    setup: [
      {
        argv: ["api", `${repoPath.slice("/api/v5/".length)}/issues`, "-X", "POST", "--input", "payload.json"],
        env: { GITCODE_TOKEN: "contract-token" },
        expect: { code: 0, stdoutJson: { title: "from-input" } }
      }
    ],
    argv: ["api", `${repoPath.slice("/api/v5/".length)}/issues/1/comments`, "-X", "POST", "-F", "body=@body.txt"],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      {
        method: "POST",
        path: `${repoPath}/issues`,
        body: { title: "from-input" },
        response: { title: "from-input" }
      },
      {
        method: "POST",
        path: `${repoPath}/issues/1/comments`,
        body: { body: "from file field\n" },
        response: { body: "from file field\n" }
      }
    ],
    expect: { code: 0, stdoutJson: { body: "from file field\n" }, stderr: "" }
  },
  {
    name: "repo view uses saved default repository context",
    setup: [{ argv: ["repo", "set-default", repo], expect: { code: 0 } }],
    argv: ["repo", "view", "--json", "fullName,defaultBranchRef"],
    requests: [
      {
        method: "GET",
        path: repoPath,
        response: { name: "REPO", full_name: repo, default_branch: "main" }
      }
    ],
    expect: { code: 0, stdoutJson: { fullName: repo, defaultBranchRef: "main" }, stderr: "" }
  },
  {
    name: "repo list and create normalize repository JSON fields",
    setup: [
      {
        argv: ["repo", "list", "OWNER", "--json", "fullName"],
        expect: { code: 0, stdoutJson: [{ fullName: repo }] }
      }
    ],
    argv: ["repo", "create", "sandbox", "--private", "--json", "fullName"],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      {
        method: "GET",
        path: "/api/v5/users/OWNER/repos",
        query: { per_page: "30" },
        response: [{ name: "REPO", full_name: repo }]
      },
      {
        method: "POST",
        path: "/api/v5/user/repos",
        body: { name: "sandbox", private: true },
        response: { name: "sandbox", full_name: "me/sandbox" }
      }
    ],
    expect: { code: 0, stdoutJson: { fullName: "me/sandbox" }, stderr: "" }
  },
  {
    name: "repo fork posts to the repository forks endpoint",
    argv: ["repo", "fork", repo, "--json", "fullName"],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      {
        method: "POST",
        path: `${repoPath}/forks`,
        response: { name: "REPO", full_name: "me/REPO" }
      }
    ],
    expect: { code: 0, stdoutJson: { fullName: "me/REPO" }, stderr: "" }
  },
  {
    name: "issue list supports gh-style repo, filters, json fields, and jq",
    argv: ["issue", "list", "-R=OWNER/REPO", "-s", "open", "-l=bug", "-L", "5", "--json=number,title", "-q", ".[0].title"],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      {
        method: "GET",
        path: `${repoPath}/issues`,
        query: { state: "open", labels: "bug", per_page: "5" },
        response: [{ number: 42, title: "contract bug", state: "open" }]
      }
    ],
    expect: { code: 0, stdoutJson: "contract bug", stderr: "" }
  },
  {
    name: "issue view includes comments and linked pull requests",
    argv: ["issue", "view", "42", "-R", repo, "--comments", "--json", "number,comments,linkedPullRequests"],
    requests: [
      {
        method: "GET",
        path: `${repoPath}/issues/42`,
        response: { number: 42, title: "contract bug", state: "open" }
      },
      {
        method: "GET",
        path: `${repoPath}/issues/42/comments`,
        response: [{ body: "note" }]
      },
      {
        method: "GET",
        path: `${repoPath}/issues/42/pull_requests`,
        response: [{ number: 9, title: "linked", base: { ref: "main" }, head: { ref: "fix" } }]
      }
    ],
    expect: {
      code: 0,
      stdoutJson: { number: 42, comments: [{ body: "note" }], linkedPullRequests: [{ number: 9, title: "linked", state: "", author: "", baseRefName: "main", headRefName: "fix", url: "https://gitcode.com/OWNER/REPO/pulls/9", body: "", raw: { number: 9, title: "linked", base: { ref: "main" }, head: { ref: "fix" } } }] },
      stderr: ""
    }
  },
  {
    name: "issue create/edit/close/reopen/comment map to write endpoints",
    setup: [
      { argv: ["issue", "create", "-R", repo, "--title", "new", "--body", "body", "--label", "bug"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutIncludes: "Created issue #43" } },
      { argv: ["issue", "edit", "43", "-R", repo, "--title", "edited", "--body", "updated", "--add-label", "triage"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutIncludes: "Updated issue #43" } },
      { argv: ["issue", "close", "43", "-R", repo, "--comment", "done"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutIncludes: "Closed issue #43" } },
      { argv: ["issue", "reopen", "43", "-R", repo], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutIncludes: "Reopened issue #43" } }
    ],
    argv: ["issue", "comment", "43", "-R", repo, "--body", "follow-up"],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      { method: "POST", path: `${repoPath}/issues`, body: { title: "new", body: "body", labels: ["bug"] }, response: { number: 43, title: "new", state: "open" } },
      { method: "PATCH", path: `${repoPath}/issues/43`, body: { title: "edited", body: "updated", labels: ["triage"] }, response: { number: 43, title: "edited", state: "open" } },
      { method: "PATCH", path: `${repoPath}/issues/43`, body: { state: "close" }, response: { number: 43, title: "edited", state: "closed" } },
      { method: "POST", path: `${repoPath}/issues/43/comments`, body: { body: "done" }, response: { body: "done" } },
      { method: "PATCH", path: `${repoPath}/issues/43`, body: { state: "reopen" }, response: { number: 43, title: "edited", state: "open" } },
      { method: "POST", path: `${repoPath}/issues/43/comments`, body: { body: "follow-up" }, response: { body: "follow-up" } }
    ],
    expect: { code: 0, stdoutIncludes: "Added comment to issue #43", stderr: "" }
  },
  {
    name: "pr list applies json field selection before templates",
    argv: ["pr", "list", "-R", repo, "--json", "number,title", "--template", "{{range .}}#{{.number}} {{.title}}\n{{end}}"],
    requests: [
      {
        method: "GET",
        path: `${repoPath}/pulls`,
        query: { state: "open", per_page: "30" },
        response: [{ number: 7, title: "contract pr", state: "open", base: { ref: "main" }, head: { ref: "feature" } }]
      }
    ],
    expect: { code: 0, stdout: "#7 contract pr\n\n", stderr: "" }
  },
  {
    name: "pr view/create/comment/review/close/reopen use pull request endpoints",
    setup: [
      { argv: ["pr", "view", "7", "-R", repo, "--comments", "--json", "comments"], expect: { code: 0, stdoutJson: { comments: [{ body: "hello" }] } } },
      { argv: ["pr", "create", "-R", repo, "--title", "new pr", "--base", "main", "--head", "feature"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutIncludes: "Created pull request #8" } },
      { argv: ["pr", "comment", "8", "-R", repo, "--body", "discussion"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutIncludes: "Added comment to pull request #8" } },
      { argv: ["pr", "review", "8", "-R", repo, "--approve", "--body", "ship it"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutIncludes: "Reviewed pull request #8" } },
      { argv: ["pr", "close", "8", "-R", repo, "--comment", "closing"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutIncludes: "Closed pull request #8" } }
    ],
    argv: ["pr", "reopen", "8", "-R", repo],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      { method: "GET", path: `${repoPath}/pulls/7`, response: { number: 7, title: "contract pr", state: "open", base: { ref: "main" }, head: { ref: "feature" } } },
      { method: "GET", path: `${repoPath}/pulls/7/comments`, response: [{ body: "hello" }] },
      { method: "POST", path: `${repoPath}/pulls`, body: { title: "new pr", base: "main", head: "feature", draft: false }, response: { number: 8, title: "new pr", base: { ref: "main" }, head: { ref: "feature" } } },
      { method: "POST", path: `${repoPath}/pulls/8/comments`, body: { body: "discussion" }, response: { body: "discussion" } },
      { method: "POST", path: `${repoPath}/pulls/8/reviews`, body: { body: "ship it", event: "APPROVE" }, response: { body: "ship it" } },
      { method: "PATCH", path: `${repoPath}/pulls/8`, body: { state: "closed", state_event: "close" }, response: { number: 8, title: "new pr", state: "closed" } },
      { method: "POST", path: `${repoPath}/pulls/8/comments`, body: { body: "closing" }, response: { body: "closing" } },
      { method: "PATCH", path: `${repoPath}/pulls/8`, body: { state: "open", state_event: "reopen" }, response: { number: 8, title: "new pr", state: "open" } }
    ],
    expect: { code: 0, stdoutIncludes: "Reopened pull request #8", stderr: "" }
  },
  {
    name: "pr review requires a body before calling the API",
    argv: ["pr", "review", "8", "-R", repo],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [],
    expect: { code: 1, stderrIncludes: "gc pr review requires --body or --body-file. Use gc pr comment for discussion-only comments." }
  },
  {
    name: "pr merge requires --yes and can delete the source branch",
    argv: ["pr", "merge", "8", "-R", repo, "--squash", "--delete-branch", "--yes"],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      { method: "GET", path: `${repoPath}/pulls/8`, response: { number: 8, title: "new pr", state: "open", base: { ref: "main" }, head: { ref: "feature" } } },
      { method: "PUT", path: `${repoPath}/pulls/8/merge`, body: { merge_method: "squash" }, response: { number: 8, title: "new pr", state: "merged" } },
      { method: "DELETE", path: `${repoPath}/branches/feature`, response: {} }
    ],
    expect: { code: 0, stdoutIncludes: "Merged pull request #8", stderr: "" }
  },
  {
    name: "file list and view cover repository content endpoints",
    setup: [{ argv: ["file", "list", "-R", repo, "src", "--json", "path,type"], expect: { code: 0, stdoutJson: [{ path: "src/index.ts", type: "file" }] } }],
    argv: ["file", "view", "README.md", "-R", repo],
    requests: [
      { method: "GET", path: `${repoPath}/contents/src`, response: [{ name: "index.ts", path: "src/index.ts", type: "file" }] },
      { method: "GET", path: `${repoPath}/contents/README.md`, response: { name: "README.md", path: "README.md", type: "file", encoding: "base64", content: Buffer.from("# Contract\n").toString("base64") } }
    ],
    expect: { code: 0, stdout: "# Contract\n\n", stderr: "" }
  },
  {
    name: "org commands cover list, view, repos, and members",
    setup: [
      { argv: ["org", "list", "--json=login"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutJson: [{ login: "OWNER" }] } },
      { argv: ["org", "view", "OWNER"], expect: { code: 0, stdoutIncludes: "demo org" } },
      { argv: ["org", "repos", "OWNER", "--json", "fullName"], expect: { code: 0, stdoutJson: [{ fullName: repo }] } }
    ],
    argv: ["org", "members", "OWNER", "--json=login"],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      { method: "GET", path: "/api/v5/user/orgs", response: [{ login: "OWNER", name: "Owner Org" }] },
      { method: "GET", path: "/api/v5/orgs/OWNER", response: { login: "OWNER", description: "demo org" } },
      { method: "GET", path: "/api/v5/orgs/OWNER/repos", query: { per_page: "30" }, response: [{ name: "REPO", full_name: repo }] },
      { method: "GET", path: "/api/v5/orgs/OWNER/members", query: { per_page: "30" }, response: [{ login: "alice", name: "Alice" }] }
    ],
    expect: { code: 0, stdoutJson: [{ login: "alice" }], stderr: "" }
  },
  {
    name: "ssh-key commands cover list, add, guarded delete, and confirmed delete",
    setup: [
      { argv: ["ssh-key", "list", "--json", "id,title"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutJson: [{ id: 1, title: "laptop" }] } },
      { argv: ["ssh-key", "add", "--title", "desktop", "--key", "ssh-ed25519 AAA"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutIncludes: "Added SSH key desktop" } },
      { argv: ["ssh-key", "delete", "2"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 1, stderrIncludes: "--yes" } }
    ],
    argv: ["ssh-key", "delete", "2", "--yes"],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      { method: "GET", path: "/api/v5/user/keys", response: [{ id: 1, title: "laptop" }] },
      { method: "POST", path: "/api/v5/user/keys", body: { title: "desktop", key: "ssh-ed25519 AAA" }, response: { id: 2, title: "desktop", key: "ssh-ed25519 AAA" } },
      { method: "DELETE", path: "/api/v5/user/keys/2", response: {} }
    ],
    expect: { code: 0, stdoutIncludes: "Deleted SSH key 2", stderr: "" }
  },
  {
    name: "label commands cover list, create, edit, guarded delete, and confirmed delete",
    setup: [
      { argv: ["label", "list", "-R", repo, "--json", "name"], expect: { code: 0, stdoutJson: [{ name: "bug" }] } },
      { argv: ["label", "create", "triage", "-R", repo, "--color", "336699", "--description", "needs review", "--json", "name,color"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutJson: { name: "triage", color: "336699" } } },
      { argv: ["label", "edit", "triage", "-R", repo, "--new-name", "review", "--color", "669933", "--json", "name"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutJson: { name: "review" } } },
      { argv: ["label", "delete", "review", "-R", repo], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 1, stderrIncludes: "--yes" } }
    ],
    argv: ["label", "delete", "review", "-R", repo, "--yes"],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      { method: "GET", path: `${repoPath}/labels`, response: [{ name: "bug", color: "ff0000" }] },
      { method: "POST", path: `${repoPath}/labels`, body: { name: "triage", color: "336699", description: "needs review" }, response: { name: "triage", color: "336699" } },
      { method: "PATCH", path: `${repoPath}/labels/triage`, body: { name: "review", color: "669933" }, response: { name: "review", color: "669933" } },
      { method: "DELETE", path: `${repoPath}/labels/review`, response: {} }
    ],
    expect: { code: 0, stdoutIncludes: "Deleted label review", stderr: "" }
  },
  {
    name: "release commands cover list, view, create, guard, and cleanup-tag delete",
    setup: [
      { argv: ["release", "list", "-R", repo, "--json", "tagName"], expect: { code: 0, stdoutJson: [{ tagName: "v1.0.0" }] } },
      { argv: ["release", "view", "v1.0.0", "-R", repo], expect: { code: 0, stdoutIncludes: "notes" } },
      { argv: ["release", "create", "v2.0.0", "-R", repo, "--title", "two", "--notes", "body", "--json", "tagName"], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 0, stdoutJson: { tagName: "v2.0.0" } } },
      { argv: ["release", "delete", "v2.0.0", "-R", repo], env: { GITCODE_TOKEN: "contract-token" }, expect: { code: 1, stderrIncludes: "--cleanup-tag" } }
    ],
    argv: ["release", "delete", "v2.0.0", "-R", repo, "--cleanup-tag", "--yes"],
    env: { GITCODE_TOKEN: "contract-token" },
    requests: [
      { method: "GET", path: `${repoPath}/releases`, response: [{ tag_name: "v1.0.0", name: "one" }] },
      { method: "GET", path: `${repoPath}/releases/v1.0.0`, response: { tag_name: "v1.0.0", body: "notes" } },
      { method: "POST", path: `${repoPath}/releases`, body: { tag_name: "v2.0.0", name: "two", body: "body" }, response: { tag_name: "v2.0.0" } },
      { method: "DELETE", path: `${repoPath}/releases/v2.0.0`, status: 405, response: { error_message: "not supported" } },
      { method: "DELETE", path: `${repoPath}/releases/v2.0.0`, status: 405, response: { error_message: "not supported" } },
      { method: "DELETE", path: `${repoPath}/tags/v2.0.0`, response: {} }
    ],
    expect: { code: 0, stdoutIncludes: "Deleted release v2.0.0", stderr: "" }
  },
  {
    name: "search commands cover repos, issues, and prs",
    setup: [
      { argv: ["search", "repos", "contract", "--json", "fullName"], expect: { code: 0, stdoutJson: [{ fullName: repo }] } },
      { argv: ["search", "issues", "bug", "-R", repo, "--state", "open", "--json", "title"], expect: { code: 0, stdoutJson: [{ title: "contract issue" }] } }
    ],
    argv: ["search", "prs", "feature", "--owner", "OWNER", "--json", "title"],
    requests: [
      { method: "GET", path: "/api/v5/search/repositories", query: { q: "contract" }, response: { items: [{ name: "REPO", full_name: repo }] } },
      { method: "GET", path: "/api/v5/search/issues", query: { q: "bug", state: "open", repo }, response: { items: [{ number: 1, title: "contract issue" }] } },
      { method: "GET", path: "/api/v5/search/pull_requests", query: { q: "feature", owner: "OWNER" }, response: { items: [{ number: 2, title: "contract pr" }] } }
    ],
    expect: { code: 0, stdoutJson: [{ title: "contract pr" }], stderr: "" }
  },
  {
    name: "browse prints GitCode URLs without opening a browser in agent mode",
    argv: ["browse", "issues/42", "-R", repo],
    requests: [],
    expect: { code: 0, stdout: "https://gitcode.com/OWNER/REPO/issues/42\n", stderr: "" }
  },
  {
    name: "config and alias commands keep local state isolated",
    setup: [
      { argv: ["config", "set", "pager", "false"], expect: { code: 0, stdoutIncludes: "Set pager" } },
      { argv: ["config", "get", "pager", "--json"], expect: { code: 0, stdoutJson: false } },
      { argv: ["alias", "set", "bugs", "issue list -R OWNER/REPO --state open --json number,title"], expect: { code: 0, stdoutIncludes: "Set alias bugs" } },
      { argv: ["alias", "list"], expect: { code: 0, stdoutIncludes: "bugs:" } }
    ],
    argv: ["bugs"],
    requests: [
      { method: "GET", path: `${repoPath}/issues`, query: { state: "open", per_page: "30" }, response: [{ number: 1, title: "bug" }] }
    ],
    expect: { code: 0, stdoutJson: [{ number: 1, title: "bug" }], stderr: "" }
  },
  {
    name: "completion emits shell completion script",
    argv: ["completion", "bash"],
    requests: [],
    expect: { code: 0, stdoutIncludes: "complete -F _gc_completion", stderr: "" }
  }
];
