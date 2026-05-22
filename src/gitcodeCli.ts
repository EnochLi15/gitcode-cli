import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { stdin as input } from "node:process";

const defaultHost = "gitcode.com";
const defaultApiBase = "https://api.gitcode.com/api/v5";
const commandNames = new Set(["auth", "api", "repo", "issue", "pr", "label", "release", "search", "browse", "config", "alias", "completion"]);
const nonJsonValues = new Set([...commandNames, "list", "view", "create", "edit", "delete", "close", "reopen", "comment", "merge", "checkout", "diff", "status", "clone", "set-default", "login", "logout", "token", "setup-git", "get", "set"]);

interface GitCodeContext {
  repo?: string;
  hostname: string;
  json: boolean;
  jsonFields?: string[];
  jq?: string;
  template?: string;
  web: boolean;
}

interface RepoRef {
  host: string;
  owner: string;
  repo: string;
}

interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  paginate?: boolean;
  requireAuth?: boolean;
}

class CliError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
  }
}

export async function runGitCodeCli(argv: string[]): Promise<void> {
  const { ctx, args } = parseGlobalArgs(argv);
  if (ctx.json && ctx.template) throw new CliError("--template cannot be used with --json");
  if (!ctx.json && ctx.jq) throw new CliError("--jq requires --json");

  let command = args.shift();
  if (!command || command === "help" || ctx.web && command === "--help") return help();
  if (command === "--help" || command === "-h") return help();
  if (command === "--version") return console.log("0.1.0");
  if (args.includes("--help") || args.includes("-h")) return help(command, args[0]);

  if (!commandNames.has(command)) {
    const expansion = await readAlias(command);
    if (expansion) return runGitCodeCli([...ctxArgs(ctx), ...shellWords(expansion), ...args]);
  }

  try {
    if (command === "auth") return authCommand(ctx, args);
    if (command === "api") return apiCommand(ctx, args);
    if (command === "repo") return repoCommand(ctx, args);
    if (command === "issue") return issueCommand(ctx, args);
    if (command === "pr") return prCommand(ctx, args);
    if (command === "label") return labelCommand(ctx, args);
    if (command === "release") return releaseCommand(ctx, args);
    if (command === "search") return searchCommand(ctx, args);
    if (command === "browse") return browseCommand(ctx, args);
    if (command === "config") return configCommand(ctx, args);
    if (command === "alias") return aliasCommand(ctx, args);
    if (command === "completion") return completionCommand(args);
    if (await runExtension(command, args)) return;
    throw new CliError(`Unknown command: ${command}. See 'gc --help' or create an external extension named gc-${command}.`);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(error instanceof Error ? error.message : String(error));
  }
}

export function isGitCodeCommand(argv: string[]): boolean {
  const args = [...argv];
  while (args[0]?.startsWith("-")) {
    const flag = args.shift();
    if (flag === "--json") {
      const next = args[0];
      if (next && !next.startsWith("-") && !nonJsonValues.has(next)) args.shift();
    } else if (takesValue(flag)) {
      args.shift();
    }
  }
  return commandNames.has(args[0] ?? "");
}

function parseGlobalArgs(argv: string[]): { ctx: GitCodeContext; args: string[] } {
  const args = [...argv];
  const ctx: GitCodeContext = {
    hostname: defaultHost,
    json: false,
    web: false
  };
  for (let i = 0; i < args.length;) {
    const arg = args[i];
    if (arg === "-R" || arg === "--repo") {
      ctx.repo = needOptionValue(args, i, arg);
      args.splice(i, 2);
      continue;
    }
    if (arg === "--hostname") {
      ctx.hostname = needOptionValue(args, i, arg);
      args.splice(i, 2);
      continue;
    }
    if (arg === "--json") {
      ctx.json = true;
      const next = args[i + 1];
      if (next && !next.startsWith("-") && !nonJsonValues.has(next)) {
        ctx.jsonFields = next.split(",").map((field) => field.trim()).filter(Boolean);
        args.splice(i, 2);
      } else {
        args.splice(i, 1);
      }
      continue;
    }
    if (arg === "--jq") {
      ctx.jq = needOptionValue(args, i, arg);
      args.splice(i, 2);
      continue;
    }
    if (arg === "--template") {
      ctx.template = needOptionValue(args, i, arg);
      args.splice(i, 2);
      continue;
    }
    if (arg === "--web") {
      ctx.web = true;
      args.splice(i, 1);
      continue;
    }
    i += 1;
  }
  return { ctx, args };
}

function takesValue(flag: string | undefined): boolean {
  return flag === "-R" || flag === "--repo" || flag === "--hostname" || flag === "--json" || flag === "--jq" || flag === "--template";
}

async function authCommand(ctx: GitCodeContext, args: string[]): Promise<void> {
  const sub = args.shift();
  if (sub === "login") {
    const withToken = takeFlag(args, "--with-token");
    if (!withToken) throw new CliError("Usage: gc auth login --with-token < token.txt");
    const token = (await readStdin()).trim();
    if (!token) throw new CliError("No token was provided on stdin");
    await saveHostToken(ctx.hostname, token);
    return emit(ctx, { hostname: ctx.hostname, tokenSource: "store" }, `Logged in to ${ctx.hostname}`);
  }
  if (sub === "status") {
    const auth = await getAuth(ctx.hostname);
    if (!auth.token) throw new CliError(`Not logged in to ${ctx.hostname}`);
    return emit(ctx, { hostname: ctx.hostname, tokenSource: auth.source }, `${ctx.hostname}: logged in (${auth.source})`);
  }
  if (sub === "token") {
    const auth = await getAuth(ctx.hostname);
    if (!auth.token) throw new CliError(`No token found for ${ctx.hostname}`);
    console.log(auth.token);
    return;
  }
  if (sub === "logout") {
    await removeHostToken(ctx.hostname);
    return emit(ctx, { hostname: ctx.hostname }, `Logged out of ${ctx.hostname}`);
  }
  if (sub === "setup-git") {
    await runProcess(gitBin(), ["config", "--global", `credential.https://${ctx.hostname}.helper`, ""]);
    await runProcess(gitBin(), ["config", "--global", "--add", `credential.https://${ctx.hostname}.helper`, "store"]);
    return emit(ctx, { hostname: ctx.hostname }, `Configured git credential helper for ${ctx.hostname}`);
  }
  throw new CliError("Usage: gc auth <login|status|token|logout|setup-git>");
}

async function apiCommand(ctx: GitCodeContext, args: string[]): Promise<void> {
  let method = "GET";
  let paginate = false;
  let inputFile: string | undefined;
  const fields: Record<string, string> = {};
  const formFiles: Record<string, string> = {};
  for (let i = 0; i < args.length;) {
    const arg = args[i];
    if (arg === "-X" || arg === "--method") {
      method = needOptionValue(args, i, arg).toUpperCase();
      args.splice(i, 2);
      continue;
    }
    if (arg === "-f") {
      Object.assign(fields, parseKeyValue(needOptionValue(args, i, arg)));
      args.splice(i, 2);
      continue;
    }
    if (arg === "-F") {
      Object.assign(formFiles, parseKeyValue(needOptionValue(args, i, arg)));
      args.splice(i, 2);
      continue;
    }
    if (arg === "--input") {
      inputFile = needOptionValue(args, i, arg);
      args.splice(i, 2);
      continue;
    }
    if (arg === "--paginate") {
      paginate = true;
      args.splice(i, 1);
      continue;
    }
    i += 1;
  }
  const path = args.shift();
  if (!path) throw new CliError("Usage: gc api <path> [-X METHOD] [-f key=value] [--input file.json] [--paginate]");
  for (const [key, value] of Object.entries(formFiles)) {
    fields[key] = value.startsWith("@") ? await readFile(value.slice(1), "utf8") : value;
  }
  const body = inputFile ? JSON.parse(await readFile(inputFile, "utf8")) : Object.keys(fields).length ? fields : undefined;
  const data = await apiRequest(path, { method, body, paginate });
  return emit(ctx, data);
}

async function repoCommand(ctx: GitCodeContext, args: string[]): Promise<void> {
  const sub = args.shift();
  if (sub === "list") {
    const owner = args[0] && !args[0].startsWith("-") ? args.shift() : undefined;
    const query: Record<string, string | number | undefined> = { per_page: Number(takeOption(args, "--limit") ?? "30") };
    const path = owner ? `users/${encodeURIComponent(owner)}/repos` : "user/repos";
    const repos = ensureArray(await apiRequest(path, { query, requireAuth: !owner })).map((repo) => normalizeRepo(repo, parseRepo(`${owner ?? "owner"}/${stringValue(asRecord(repo).name, "repo")}`, ctx.hostname)));
    return emit(ctx, repos, repos.length ? repos.map((repo) => `${repo.fullName}\t${repo.description ?? ""}`).join("\n") : "No repositories found");
  }
  if (sub === "view") {
    const target = args[0] && !args[0].startsWith("-") ? args.shift() : undefined;
    const repo = await resolveRepo({ ...ctx, repo: target ?? ctx.repo });
    if (ctx.web) return openUrl(repoWebUrl(repo));
    const data = normalizeRepo(await apiRequest(repoApiPath(repo), {}), repo);
    return emit(ctx, data, repoHuman(data));
  }
  if (sub === "set-default") {
    const target = args.shift() ?? ctx.repo;
    if (!target) throw new CliError("Usage: gc repo set-default OWNER/REPO");
    const repo = parseRepo(target, ctx.hostname);
    await saveDefaultRepo(repo);
    return emit(ctx, repo, `Set default repository to ${repo.owner}/${repo.repo}`);
  }
  if (sub === "clone") {
    const marker = args.indexOf("--");
    const passthrough = marker >= 0 ? args.splice(marker + 1) : [];
    if (marker >= 0) args.splice(marker, 1);
    const target = args.shift();
    if (!target) throw new CliError("Usage: gc repo clone OWNER/REPO [directory] [-- git args]");
    const directory = args.shift();
    const repo = parseRepo(target, ctx.hostname);
    const cloneArgs = ["clone", cloneUrl(repo), ...(directory ? [directory] : []), ...passthrough];
    await runProcess(gitBin(), cloneArgs);
    return;
  }
  if (sub === "create") {
    const name = needArg(args.shift(), "Usage: gc repo create NAME [--private|--public] [--description TEXT]");
    const isPrivate = takeFlag(args, "--private");
    const isPublic = takeFlag(args, "--public");
    const repo = normalizeRepo(await apiRequest("user/repos", {
      method: "POST",
      body: compact({ name, description: takeOption(args, "--description"), private: isPrivate ? true : isPublic ? false : undefined }),
      requireAuth: true
    }), parseRepo(`me/${name}`, ctx.hostname));
    return emit(ctx, repo, `Created repository ${repo.fullName}`);
  }
  if (sub === "fork") {
    const target = args.shift() ?? ctx.repo;
    if (!target) throw new CliError("Usage: gc repo fork OWNER/REPO");
    const repo = parseRepo(target, ctx.hostname);
    const fork = normalizeRepo(await apiRequest(`${repoApiPath(repo)}/forks`, { method: "POST", requireAuth: true }), repo);
    return emit(ctx, fork, `Forked repository ${repo.owner}/${repo.repo}`);
  }
  if (sub === "sync") {
    const destination = args.shift();
    const remote = destination ?? "origin";
    await runProcess(gitBin(), ["fetch", remote]);
    await runProcess(gitBin(), ["pull", "--ff-only", remote]);
    return emit(ctx, { remote }, `Synced local repository from ${remote}`);
  }
  throw new CliError("Usage: gc repo <list|view|clone|set-default|create|fork|sync>");
}

async function issueCommand(ctx: GitCodeContext, args: string[]): Promise<void> {
  const sub = args.shift();
  if (sub === "list") {
    const repo = await resolveRepo(ctx);
    const query = {
      state: takeOption(args, "--state") ?? "open",
      labels: takeOption(args, "--label"),
      assignee: takeOption(args, "--assignee"),
      per_page: Number(takeOption(args, "--limit") ?? "30")
    };
    const issues = ensureArray(await apiRequest(`${repoApiPath(repo)}/issues`, { query })).map((issue) => normalizeIssue(issue, repo));
    return emit(ctx, issues, issueListHuman(issues, repo));
  }
  if (sub === "view") {
    const repo = await resolveRepo(ctx);
    const number = objectNumber(needArg(args.shift(), "Usage: gc issue view NUMBER [--comments] [--web]"));
    if (ctx.web) return openUrl(`${repoWebUrl(repo)}/issues/${number}`);
    const withComments = takeFlag(args, "--comments");
    const issue = normalizeIssue(await apiRequest(`${repoApiPath(repo)}/issues/${number}`, {}), repo);
    const data = { ...issue, comments: withComments ? await optionalArray(`${repoApiPath(repo)}/issues/${number}/comments`) : [], linkedPullRequests: (await optionalArray(`${repoApiPath(repo)}/issues/${number}/pull_requests`)).map((pr) => normalizePull(pr, repo)) };
    return emit(ctx, data, issueHuman(data));
  }
  if (sub === "create") {
    const repo = await resolveRepo(ctx);
    const title = takeOption(args, "--title");
    const body = await bodyFromArgs(args);
    if (!title) throw new CliError("Usage: gc issue create --title TEXT [--body TEXT|--body-file FILE]");
    const labels = takeMany(args, "--label");
    const assignees = takeMany(args, "--assignee");
    const issue = normalizeIssue(await apiRequest(`${repoApiPath(repo)}/issues`, { method: "POST", body: compact({ title, body, labels, assignees }), requireAuth: true }), repo);
    return emit(ctx, issue, `Created issue #${issue.number}: ${issue.title}`);
  }
  if (sub === "edit" || sub === "close" || sub === "reopen") {
    const repo = await resolveRepo(ctx);
    const number = objectNumber(needArg(args.shift(), `Usage: gc issue ${sub} NUMBER`));
    const body = sub === "edit"
      ? compact({ title: takeOption(args, "--title"), body: await bodyFromArgs(args), labels: takeMany(args, "--add-label"), remove_labels: takeMany(args, "--remove-label"), assignees: takeMany(args, "--add-assignee"), remove_assignees: takeMany(args, "--remove-assignee") })
      : { state: sub === "close" ? "close" : "reopen" };
    const issue = normalizeIssue(await apiRequest(`${repoApiPath(repo)}/issues/${number}`, { method: "PATCH", body, requireAuth: true }), repo);
    const comment = takeOption(args, "--comment");
    if (comment) await apiRequest(`${repoApiPath(repo)}/issues/${number}/comments`, { method: "POST", body: { body: comment }, requireAuth: true });
    return emit(ctx, issue, `${sub === "edit" ? "Updated" : sub === "close" ? "Closed" : "Reopened"} issue #${issue.number}`);
  }
  if (sub === "comment") {
    const repo = await resolveRepo(ctx);
    const number = objectNumber(needArg(args.shift(), "Usage: gc issue comment NUMBER --body TEXT"));
    const body = takeOption(args, "--body") ?? await bodyFromFile(args);
    if (!body) throw new CliError("Usage: gc issue comment NUMBER --body TEXT");
    const comment = await apiRequest(`${repoApiPath(repo)}/issues/${number}/comments`, { method: "POST", body: { body }, requireAuth: true });
    return emit(ctx, comment, `Added comment to issue #${number}`);
  }
  throw new CliError("Usage: gc issue <list|view|create|edit|close|reopen|comment>");
}

async function prCommand(ctx: GitCodeContext, args: string[]): Promise<void> {
  const sub = args.shift();
  if (sub === "list") {
    const repo = await resolveRepo(ctx);
    const query = {
      state: takeOption(args, "--state") ?? "open",
      base: takeOption(args, "--base"),
      head: takeOption(args, "--head"),
      per_page: Number(takeOption(args, "--limit") ?? "30")
    };
    const prs = ensureArray(await apiRequest(`${repoApiPath(repo)}/pulls`, { query })).map((pr) => normalizePull(pr, repo));
    return emit(ctx, prs, prListHuman(prs, repo));
  }
  if (sub === "view") {
    const repo = await resolveRepo(ctx);
    const number = objectNumber(needArg(args.shift(), "Usage: gc pr view NUMBER [--comments] [--web]"));
    if (ctx.web) return openUrl(`${repoWebUrl(repo)}/pulls/${number}`);
    const withComments = takeFlag(args, "--comments");
    const pr = normalizePull(await apiRequest(`${repoApiPath(repo)}/pulls/${number}`, {}), repo);
    const data = { ...pr, comments: withComments ? await optionalArray(`${repoApiPath(repo)}/pulls/${number}/comments`) : [] };
    return emit(ctx, data, prHuman(data));
  }
  if (sub === "create") {
    const repo = await resolveRepo(ctx);
    const title = takeOption(args, "--title");
    const body = await bodyFromArgs(args);
    const base = takeOption(args, "--base") ?? "main";
    const head = takeOption(args, "--head") ?? await currentBranch();
    const draft = takeFlag(args, "--draft");
    if (!title) throw new CliError("Usage: gc pr create --title TEXT [--body TEXT] [--base BRANCH] [--head BRANCH]");
    const pr = normalizePull(await apiRequest(`${repoApiPath(repo)}/pulls`, { method: "POST", body: compact({ title, body, base, head, draft }), requireAuth: true }), repo);
    return emit(ctx, pr, `Created pull request #${pr.number}: ${pr.title}`);
  }
  if (sub === "comment" || sub === "review") {
    const repo = await resolveRepo(ctx);
    const number = objectNumber(needArg(args.shift(), `Usage: gc pr ${sub} NUMBER --body TEXT`));
    const body = takeOption(args, "--body") ?? await bodyFromFile(args) ?? "";
    if (!body && sub === "comment") throw new CliError(`Usage: gc pr ${sub} NUMBER --body TEXT`);
    const endpoint = sub === "comment" ? "comments" : "reviews";
    const event = takeFlag(args, "--approve") ? "APPROVE" : takeFlag(args, "--request-changes") ? "REQUEST_CHANGES" : "COMMENT";
    const data = await apiRequest(`${repoApiPath(repo)}/pulls/${number}/${endpoint}`, { method: "POST", body: sub === "review" ? { body, event } : { body }, requireAuth: true });
    return emit(ctx, data, `${sub === "review" ? "Reviewed" : "Added comment to"} pull request #${number}`);
  }
  if (sub === "merge") {
    const repo = await resolveRepo(ctx);
    const number = objectNumber(needArg(args.shift(), "Usage: gc pr merge NUMBER [--merge|--squash|--rebase] [--delete-branch]"));
    const method = takeFlag(args, "--squash") ? "squash" : takeFlag(args, "--rebase") ? "rebase" : "merge";
    const deleteBranch = takeFlag(args, "--delete-branch");
    const pr = normalizePull(await apiRequest(`${repoApiPath(repo)}/pulls/${number}/merge`, { method: "PUT", body: { merge_method: method }, requireAuth: true }), repo);
    const headRef = stringValue(pr.headRefName, "");
    const baseRef = stringValue(pr.baseRefName, "");
    if (deleteBranch && headRef && headRef !== baseRef && headRef !== "main" && headRef !== "master") {
      await apiRequest(`${repoApiPath(repo)}/branches/${encodeURIComponent(headRef)}`, { method: "DELETE", requireAuth: true }).catch(() => undefined);
    }
    return emit(ctx, pr, `Merged pull request #${number}`);
  }
  if (sub === "close" || sub === "reopen") {
    const repo = await resolveRepo(ctx);
    const number = objectNumber(needArg(args.shift(), `Usage: gc pr ${sub} NUMBER`));
    const pr = normalizePull(await apiRequest(`${repoApiPath(repo)}/pulls/${number}`, { method: "PATCH", body: { state: sub === "close" ? "closed" : "open", state_event: sub }, requireAuth: true }), repo);
    const comment = takeOption(args, "--comment");
    if (comment) await apiRequest(`${repoApiPath(repo)}/pulls/${number}/comments`, { method: "POST", body: { body: comment }, requireAuth: true });
    return emit(ctx, pr, `${sub === "close" ? "Closed" : "Reopened"} pull request #${number}`);
  }
  if (sub === "checkout") {
    const repo = await resolveRepo(ctx);
    const number = objectNumber(needArg(args.shift(), "Usage: gc pr checkout NUMBER"));
    const pr = normalizePull(await apiRequest(`${repoApiPath(repo)}/pulls/${number}`, {}), repo);
    const branch = stringValue(pr.headRefName, "") || `pr-${number}`;
    await runProcess(gitBin(), ["fetch", "origin", `${branch}:${branch}`]);
    await runProcess(gitBin(), ["checkout", branch]);
    return;
  }
  if (sub === "diff") {
    const repo = await resolveRepo(ctx);
    const number = args[0] && !args[0].startsWith("-") ? objectNumber(args.shift()!) : undefined;
    const nameOnly = takeFlag(args, "--name-only");
    const patch = takeFlag(args, "--patch");
    const range = number ? await prDiffRange(repo, number) : undefined;
    await runProcess(gitBin(), ["diff", ...(nameOnly ? ["--name-only"] : []), ...(patch ? ["--patch"] : []), range ?? "HEAD"]);
    return;
  }
  if (sub === "status") {
    const repo = await resolveRepo(ctx).catch(() => undefined);
    const branch = await currentBranch().catch(() => "");
    const prs = repo ? ensureArray(await apiRequest(`${repoApiPath(repo)}/pulls`, { query: { head: branch, state: "open" } })).map((pr) => normalizePull(pr, repo)) : [];
    return emit(ctx, { branch, pullRequests: prs }, prs.length ? prListHuman(prs, repo) : `Current branch: ${branch}\nNo open pull request found for this branch.`);
  }
  throw new CliError("Usage: gc pr <list|view|create|checkout|diff|status|comment|review|merge|close|reopen>");
}

async function labelCommand(ctx: GitCodeContext, args: string[]): Promise<void> {
  const sub = args.shift();
  const repo = await resolveRepo(ctx);
  if (sub === "list") {
    const labels = ensureArray(await apiRequest(`${repoApiPath(repo)}/labels`, {})).map(normalizeLabel);
    return emit(ctx, labels, labels.map((label) => `${label.name}\t${label.color}\t${label.description ?? ""}`).join("\n"));
  }
  if (sub === "create") {
    const name = needArg(args.shift(), "Usage: gc label create NAME --color RRGGBB [--description TEXT]");
    const label = normalizeLabel(await apiRequest(`${repoApiPath(repo)}/labels`, { method: "POST", body: compact({ name, color: takeOption(args, "--color"), description: takeOption(args, "--description") }), requireAuth: true }));
    return emit(ctx, label, `Created label ${label.name}`);
  }
  if (sub === "edit") {
    const name = needArg(args.shift(), "Usage: gc label edit NAME [--new-name NAME] [--color RRGGBB] [--description TEXT]");
    const label = normalizeLabel(await apiRequest(`${repoApiPath(repo)}/labels/${encodeURIComponent(name)}`, { method: "PATCH", body: compact({ name: takeOption(args, "--new-name"), color: takeOption(args, "--color"), description: takeOption(args, "--description") }), requireAuth: true }));
    return emit(ctx, label, `Updated label ${label.name}`);
  }
  if (sub === "delete") {
    const name = needArg(args.shift(), "Usage: gc label delete NAME");
    await apiRequest(`${repoApiPath(repo)}/labels/${encodeURIComponent(name)}`, { method: "DELETE", requireAuth: true });
    return emit(ctx, { name }, `Deleted label ${name}`);
  }
  throw new CliError("Usage: gc label <list|create|edit|delete>");
}

async function releaseCommand(ctx: GitCodeContext, args: string[]): Promise<void> {
  const sub = args.shift();
  const repo = await resolveRepo(ctx);
  if (sub === "list") {
    const releases = ensureArray(await apiRequest(`${repoApiPath(repo)}/releases`, {})).map(normalizeRelease);
    return emit(ctx, releases, releases.map((release) => `${release.tagName}\t${release.name ?? ""}`).join("\n"));
  }
  if (sub === "view") {
    const tag = needArg(args.shift(), "Usage: gc release view TAG");
    if (ctx.web) return openUrl(`${repoWebUrl(repo)}/releases/${encodeURIComponent(tag)}`);
    const release = normalizeRelease(await apiRequest(`${repoApiPath(repo)}/releases/${encodeURIComponent(tag)}`, {}));
    return emit(ctx, release, `${release.tagName}\t${release.name ?? ""}\n${release.body ?? ""}`.trim());
  }
  if (sub === "create") {
    const tag = needArg(args.shift(), "Usage: gc release create TAG [files...] --title TEXT --notes TEXT");
    const files: string[] = [];
    for (let i = 0; i < args.length;) {
      const arg = args[i];
      if (arg.startsWith("-")) {
        i += takesValue(arg) || ["--title", "--notes", "--notes-file"].includes(arg) ? 2 : 1;
        continue;
      }
      files.push(arg);
      args.splice(i, 1);
    }
    const title = takeOption(args, "--title") ?? tag;
    const notes = takeOption(args, "--notes") ?? await bodyFromFileAlias(args, "--notes-file") ?? "";
    const release = normalizeRelease(await apiRequest(`${repoApiPath(repo)}/releases`, { method: "POST", body: compact({ tag_name: tag, name: title, body: notes }), requireAuth: true }));
    for (const file of files) {
      await apiRequest(`${repoApiPath(repo)}/releases/${encodeURIComponent(tag)}/assets`, { method: "POST", body: { file }, requireAuth: true }).catch(() => undefined);
    }
    return emit(ctx, { ...release, uploadedAssets: files }, `Created release ${release.tagName}`);
  }
  if (sub === "delete") {
    const tag = needArg(args.shift(), "Usage: gc release delete TAG");
    await apiRequest(`${repoApiPath(repo)}/releases/${encodeURIComponent(tag)}`, { method: "DELETE", requireAuth: true });
    return emit(ctx, { tagName: tag }, `Deleted release ${tag}`);
  }
  throw new CliError("Usage: gc release <list|view|create|delete>");
}

async function searchCommand(ctx: GitCodeContext, args: string[]): Promise<void> {
  const type = args.shift();
  const state = takeOption(args, "--state");
  const owner = takeOption(args, "--owner");
  const repo = takeOption(args, "-R", "--repo") ?? ctx.repo;
  const limit = takeOption(args, "--limit");
  const query = args.join(" ").trim();
  if (!type || !query) throw new CliError("Usage: gc search <repos|issues|prs> QUERY");
  const path = type === "repos" ? "search/repositories" : type === "issues" ? "search/issues" : type === "prs" ? "search/pull_requests" : undefined;
  if (!path) throw new CliError("Usage: gc search <repos|issues|prs> QUERY");
  const data = await apiRequest(path, { query: { q: query, state, owner, repo, per_page: limit ? Number(limit) : undefined } });
  return emit(ctx, normalizeSearchResult(type, data), searchHuman(type, data));
}

async function browseCommand(ctx: GitCodeContext, args: string[]): Promise<void> {
  const repo = await resolveRepo(ctx);
  const target = args.shift();
  let url = repoWebUrl(repo);
  if (target) {
    if (/^(issues?|i)\/?\d+$/.test(target)) url += `/issues/${objectNumber(target)}`;
    else if (/^(pulls?|prs?|p)\/?\d+$/.test(target)) url += `/pulls/${objectNumber(target)}`;
    else if (/^(releases?|tags?)\/.+/.test(target)) url += `/${target.replace(/^tags?/, "releases")}`;
    else if (/^(branch(?:es)?|tree)\//.test(target)) url += `/tree/${target.replace(/^(branch(?:es)?|tree)\//, "")}`;
    else if (/^(files?|blob)\//.test(target)) url += `/blob/${target.replace(/^(files?|blob)\//, "")}`;
    else if (["issues", "pulls", "prs", "releases"].includes(target)) url += `/${target === "prs" ? "pulls" : target}`;
    else url += `/${target.replace(/^\/+/, "")}`;
  }
  return openUrl(url);
}

async function configCommand(ctx: GitCodeContext, args: string[]): Promise<void> {
  const sub = args.shift();
  if (sub === "get") {
    const key = needArg(args.shift(), "Usage: gc config get KEY");
    const config = await readUserConfig();
    const value = getPath(config, key);
    if (value === undefined) throw new CliError(`No config value found for ${key}`);
    return emit(ctx, value, String(value));
  }
  if (sub === "set") {
    const key = needArg(args.shift(), "Usage: gc config set KEY VALUE");
    const value = needArg(args.shift(), "Usage: gc config set KEY VALUE");
    const config = await readUserConfig();
    setPath(config, key, coerceConfigValue(value));
    await writeUserConfig(config);
    return emit(ctx, { key, value: coerceConfigValue(value) }, `Set ${key}`);
  }
  if (sub === "list") {
    const config = await readUserConfig();
    const rows = flattenConfig(config).filter(([key]) => !key.startsWith("aliases."));
    return emit(ctx, Object.fromEntries(rows), rows.length ? rows.map(([key, value]) => `${key}=${value}`).join("\n") : "No config values set");
  }
  throw new CliError("Usage: gc config <get|set|list>");
}

async function aliasCommand(ctx: GitCodeContext, args: string[]): Promise<void> {
  const sub = args.shift();
  if (sub === "set") {
    const name = needArg(args.shift(), "Usage: gc alias set NAME EXPANSION");
    const expansion = args.join(" ").trim();
    if (!expansion) throw new CliError("Usage: gc alias set NAME EXPANSION");
    const config = await readUserConfig();
    const aliases = asRecord(config.aliases);
    aliases[name] = expansion;
    config.aliases = aliases;
    await writeUserConfig(config);
    return emit(ctx, { name, expansion }, `Set alias ${name}`);
  }
  if (sub === "list") {
    const aliases = asRecord((await readUserConfig()).aliases);
    const rows = Object.entries(aliases);
    return emit(ctx, aliases, rows.length ? rows.map(([name, expansion]) => `${name}: ${expansion}`).join("\n") : "No aliases configured");
  }
  if (sub === "delete") {
    const name = needArg(args.shift(), "Usage: gc alias delete NAME");
    const config = await readUserConfig();
    const aliases = asRecord(config.aliases);
    delete aliases[name];
    config.aliases = aliases;
    await writeUserConfig(config);
    return emit(ctx, { name }, `Deleted alias ${name}`);
  }
  throw new CliError("Usage: gc alias <set|list|delete>");
}

async function completionCommand(args: string[]): Promise<void> {
  const shell = args.shift() ?? "bash";
  const words = [...commandNames].sort().join(" ");
  if (shell === "zsh") {
    console.log(`#compdef gc gitcode\n_arguments '1: :(${words})'`);
    return;
  }
  if (shell === "fish") {
    console.log(`complete -c gc -f -a "${words}"\ncomplete -c gitcode -f -a "${words}"`);
    return;
  }
  if (shell === "bash") {
    console.log(`_gc_completion() { COMPREPLY=( $(compgen -W "${words}" -- "\${COMP_WORDS[COMP_CWORD]}") ); }\ncomplete -F _gc_completion gc gitcode`);
    return;
  }
  throw new CliError("Usage: gc completion [bash|zsh|fish]");
}

async function runExtension(command: string, args: string[]): Promise<boolean> {
  const executable = await findExecutable(`gc-${command}`);
  if (!executable) return false;
  await runProcess(executable, args);
  return true;
}

async function apiRequest(path: string, options: RequestOptions): Promise<unknown> {
  const auth = await getAuth(defaultHost);
  if (options.requireAuth && !auth.token) throw new CliError("Authentication required. Run `gc auth login --with-token` or set GITCODE_TOKEN.");
  const base = process.env.GITCODE_API_BASE ?? defaultApiBase;
  const url = new URL(path.replace(/^\/+/, ""), base.endsWith("/") ? base : `${base}/`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    "accept": "application/json",
    "user-agent": "gitcode-cli/0.1"
  };
  if (auth.token) {
    headers.authorization = `Bearer ${auth.token}`;
    headers["PRIVATE-TOKEN"] = auth.token;
  }
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const init = { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) };
  if (options.paginate) return paginate(url, init, auth.token);
  return requestOne(url, init, auth.token);
}

async function requestOne(url: URL, init: RequestInit, token?: string): Promise<unknown> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = parseResponseBody(text, response.headers.get("content-type"));
  if ((response.status === 401 || response.status === 403) && token && !url.searchParams.has("access_token")) {
    const retry = new URL(url);
    retry.searchParams.set("access_token", token);
    return requestOne(retry, init);
  }
  if (!response.ok) throw new CliError(`GitCode API ${response.status}: ${response.statusText}${text ? `: ${sanitizeApiText(text)}` : ""}`);
  return data;
}

async function paginate(url: URL, init: RequestInit, token?: string): Promise<unknown[]> {
  const out: unknown[] = [];
  let next: URL | undefined = url;
  let page = Number(next.searchParams.get("page") ?? "1");
  while (next) {
    const response = await fetch(next, init);
    const text = await response.text();
    if ((response.status === 401 || response.status === 403) && token && !next.searchParams.has("access_token")) {
      next = new URL(next);
      next.searchParams.set("access_token", token);
      continue;
    }
    if (!response.ok) throw new CliError(`GitCode API ${response.status}: ${response.statusText}${text ? `: ${sanitizeApiText(text)}` : ""}`);
    const data = parseResponseBody(text, response.headers.get("content-type"));
    if (Array.isArray(data)) out.push(...data);
    else out.push(data);
    const linkNext = parseNextLink(response.headers.get("link"));
    if (linkNext) {
      next = new URL(linkNext);
    } else if (Array.isArray(data) && data.length > 0) {
      page += 1;
      next = new URL(next);
      next.searchParams.set("page", String(page));
    } else {
      next = undefined;
    }
  }
  return out;
}

function parseResponseBody(text: string, contentType: string | null): unknown {
  if (!text) return null;
  if ((contentType ?? "").includes("json") || /^[\s\n]*[{\[]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function sanitizeApiText(text: string): string {
  return text
    .replace(/("?(?:access_token|private_token|token)"?\s*[:=]\s*"?)[^"&\s}]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
}

function parseNextLink(link: string | null): string | undefined {
  if (!link) return undefined;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="?next"?/);
    if (match) return match[1];
  }
  return undefined;
}

async function resolveRepo(ctx: GitCodeContext): Promise<RepoRef> {
  if (ctx.repo) return parseRepo(ctx.repo, ctx.hostname);
  if (process.env.GC_REPO) return parseRepo(process.env.GC_REPO, ctx.hostname);
  const fromRemote = await repoFromGitRemote(ctx.hostname);
  if (fromRemote) return fromRemote;
  const saved = await readDefaultRepo();
  if (saved) return parseRepo(saved, ctx.hostname);
  throw new CliError("Could not resolve repository. Pass -R OWNER/REPO or run `gc repo set-default OWNER/REPO`.");
}

function parseRepo(value: string, fallbackHost = defaultHost): RepoRef {
  const trimmed = value.replace(/^https?:\/\//, "").replace(/\.git$/, "");
  const ssh = trimmed.match(/^(?:git@)?([^:]+):([^/]+)\/(.+)$/);
  const parts = ssh ? [ssh[1], ssh[2], ssh[3]] : trimmed.split("/");
  if (parts.length === 2) return { host: fallbackHost, owner: parts[0], repo: parts[1] };
  if (parts.length === 3) return { host: parts[0], owner: parts[1], repo: parts[2] };
  throw new CliError(`Invalid repository: ${value}. Expected OWNER/REPO or HOST/OWNER/REPO.`);
}

async function repoFromGitRemote(host: string): Promise<RepoRef | undefined> {
  const output = await runProcess(gitBin(), ["remote", "-v"], { capture: true }).catch(() => "");
  for (const line of output.split("\n")) {
    if (!line.includes(host)) continue;
    const match = line.match(/(?:https?:\/\/|git@)([^/:]+)[/:]([^/\s]+)\/([^\s]+?)(?:\.git)?(?:\s|\))/);
    if (match) return { host: match[1], owner: match[2], repo: match[3].replace(/\.git$/, "") };
  }
  return undefined;
}

function repoApiPath(repo: RepoRef): string {
  return `repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
}

function repoWebUrl(repo: RepoRef): string {
  return `https://${repo.host}/${repo.owner}/${repo.repo}`;
}

function cloneUrl(repo: RepoRef): string {
  return `${repoWebUrl(repo)}.git`;
}

function normalizeRepo(raw: unknown, repo: RepoRef): Record<string, unknown> {
  const item = asRecord(raw);
  return {
    name: stringValue(item.name, repo.repo),
    owner: stringValue(asRecord(item.owner).login ?? asRecord(item.namespace).path, repo.owner),
    fullName: stringValue(item.full_name ?? item.path_with_namespace, `${repo.owner}/${repo.repo}`),
    description: item.description ?? "",
    defaultBranchRef: item.default_branch ?? item.defaultBranchRef ?? "main",
    url: item.html_url ?? item.web_url ?? repoWebUrl(repo),
    raw: item
  };
}

function normalizeIssue(raw: unknown, repo: RepoRef): Record<string, unknown> {
  const item = asRecord(raw);
  const number = item.number ?? item.iid ?? item.id;
  return {
    number,
    title: item.title ?? "",
    state: item.state ?? "",
    author: authorName(item),
    labels: normalizeLabels(item.labels),
    assignees: Array.isArray(item.assignees) ? item.assignees.map(authorName) : [],
    url: item.html_url ?? item.web_url ?? `${repoWebUrl(repo)}/issues/${number}`,
    createdAt: item.created_at ?? item.createdAt,
    updatedAt: item.updated_at ?? item.updatedAt,
    body: item.body ?? item.description ?? "",
    raw: item
  };
}

function normalizePull(raw: unknown, repo: RepoRef): Record<string, unknown> {
  const item = asRecord(raw);
  const number = item.number ?? item.iid ?? item.id;
  return {
    number,
    title: item.title ?? "",
    state: item.merged_at ? "merged" : item.state ?? "",
    author: authorName(item),
    baseRefName: stringValue(asRecord(item.base).ref ?? item.base_ref ?? item.base, ""),
    headRefName: stringValue(asRecord(item.head).ref ?? item.head_ref ?? item.head, ""),
    url: item.html_url ?? item.web_url ?? `${repoWebUrl(repo)}/pulls/${number}`,
    createdAt: item.created_at ?? item.createdAt,
    updatedAt: item.updated_at ?? item.updatedAt,
    body: item.body ?? item.description ?? "",
    raw: item
  };
}

function normalizeLabel(raw: unknown): Record<string, unknown> {
  const item = asRecord(raw);
  return {
    name: item.name ?? "",
    color: item.color ?? "",
    description: item.description ?? "",
    raw: item
  };
}

function normalizeRelease(raw: unknown): Record<string, unknown> {
  const item = asRecord(raw);
  return {
    tagName: item.tag_name ?? item.tagName ?? item.name ?? "",
    name: item.name ?? item.title ?? "",
    body: item.body ?? item.description ?? "",
    url: item.html_url ?? item.web_url ?? "",
    raw: item
  };
}

function normalizeSearchResult(type: string, raw: unknown): unknown {
  const items = Array.isArray(raw) ? raw : ensureArray(asRecord(raw).items);
  if (!items.length) return raw;
  const repoFallback = parseRepo("search/result");
  if (type === "repos") return items.map((item) => normalizeRepo(item, repoFallback));
  if (type === "issues") return items.map((item) => normalizeIssue(item, repoFallback));
  if (type === "prs") return items.map((item) => normalizePull(item, repoFallback));
  return raw;
}

function normalizeLabels(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  return labels.map((label) => typeof label === "string" ? label : stringValue(asRecord(label).name, "")).filter(Boolean);
}

function authorName(item: Record<string, unknown>): string {
  const user = asRecord(item.user ?? item.author ?? item.assignee);
  return stringValue(user.login ?? user.name ?? user.username ?? item.author, "");
}

function repoHuman(repo: Record<string, unknown>): string {
  return `${repo.fullName}\t${repo.description ?? ""}\nDefault branch: ${repo.defaultBranchRef}\n${repo.url}`;
}

function issueListHuman(issues: Record<string, unknown>[], repo: RepoRef): string {
  if (!issues.length) return `No issues found in ${repo.owner}/${repo.repo}`;
  return [`Showing ${issues.length} issues in ${repo.owner}/${repo.repo}`, ...issues.map((issue) => `#${issue.number}\t${issue.state}\t${issue.title}`)].join("\n");
}

function issueHuman(issue: Record<string, unknown>): string {
  return `#${issue.number} ${issue.title}\nState: ${issue.state}\nAuthor: ${issue.author}\n${issue.url}\n\n${issue.body ?? ""}`.trim();
}

function prListHuman(prs: Record<string, unknown>[], repo?: RepoRef): string {
  if (!prs.length) return repo ? `No pull requests found in ${repo.owner}/${repo.repo}` : "No pull requests found";
  return [`Showing ${prs.length} pull requests${repo ? ` in ${repo.owner}/${repo.repo}` : ""}`, ...prs.map((pr) => `#${pr.number}\t${pr.state}\t${pr.headRefName} -> ${pr.baseRefName}\t${pr.title}`)].join("\n");
}

function prHuman(pr: Record<string, unknown>): string {
  return `#${pr.number} ${pr.title}\nState: ${pr.state}\nBranch: ${pr.headRefName} -> ${pr.baseRefName}\nAuthor: ${pr.author}\n${pr.url}\n\n${pr.body ?? ""}`.trim();
}

function searchHuman(type: string, raw: unknown): string {
  const items = Array.isArray(raw) ? raw : ensureArray(asRecord(raw).items);
  if (!items.length) return `No ${type} matched the search query`;
  return items.map((item) => {
    const record = asRecord(item);
    return `${record.full_name ?? record.title ?? record.name ?? record.path_with_namespace ?? JSON.stringify(record)}`;
  }).join("\n");
}

function emit(ctx: GitCodeContext, data: unknown, human?: string): void {
  if (ctx.template) {
    console.log(renderTemplate(ctx.template, data));
    return;
  }
  const selected = ctx.jsonFields?.length ? selectFields(data, ctx.jsonFields) : data;
  const filtered = ctx.jq ? applyJq(selected, ctx.jq) : selected;
  if (ctx.json || ctx.jq || ctx.jsonFields?.length) {
    const jsonValue = filtered === undefined ? null : filtered;
    console.log(typeof jsonValue === "string" ? JSON.stringify(jsonValue) : JSON.stringify(jsonValue, null, 2));
    return;
  }
  if (human !== undefined) console.log(human);
  else if (typeof data === "string") console.log(data);
  else console.log(JSON.stringify(data, null, 2));
}

export function emitGitCodeError(argv: string[], error: unknown): never {
  const wantsJson = argv.includes("--json");
  const message = error instanceof Error ? error.message : String(error);
  if (wantsJson) console.log(JSON.stringify({ error: message }));
  else console.error(`Error: ${message}`);
  process.exit(error instanceof CliError ? error.exitCode : 1);
}

function selectFields(data: unknown, fields: string[]): unknown {
  if (Array.isArray(data)) return data.map((item) => pickFields(item, fields));
  return pickFields(data, fields);
}

function pickFields(data: unknown, fields: string[]): Record<string, unknown> {
  const item = asRecord(data);
  return Object.fromEntries(fields.map((field) => [field, getPath(item, field)]));
}

function applyJq(data: unknown, expr: string): unknown {
  const trimmed = expr.trim();
  if (trimmed === ".") return data;
  const each = trimmed.match(/^\.\[\]\.([A-Za-z0-9_.]+)$/);
  if (each && Array.isArray(data)) return data.map((item) => getPath(item, each[1]));
  const first = trimmed.match(/^\.\[(\d+)](?:\.([A-Za-z0-9_.]+))?$/);
  if (first && Array.isArray(data)) {
    const value = data[Number(first[1])];
    return first[2] ? getPath(value, first[2]) : value;
  }
  if (trimmed.startsWith(".")) return getPath(data, trimmed.slice(1));
  throw new CliError(`Unsupported jq expression: ${expr}`);
}

function renderTemplate(template: string, data: unknown): string {
  return template.replace(/{{range \.}}([\s\S]*?){{end}}/g, (_match, inner: string) => {
    if (!Array.isArray(data)) return "";
    return data.map((item) => renderTemplate(inner, item)).join("");
  }).replace(/{{\.([A-Za-z0-9_.]+)}}/g, (_match, path: string) => String(getPath(data, path) ?? ""));
}

function getPath(data: unknown, path: string): unknown {
  return path.split(".").filter(Boolean).reduce<unknown>((value, key) => asRecord(value)[key], data);
}

function setPath(data: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  const last = parts.pop();
  if (!last) throw new CliError("Config key cannot be empty");
  let cursor = data;
  for (const part of parts) {
    const next = asRecord(cursor[part]);
    cursor[part] = next;
    cursor = next;
  }
  cursor[last] = value;
}

function flattenConfig(data: unknown, prefix = ""): [string, unknown][] {
  const record = asRecord(data);
  return Object.entries(record).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) return flattenConfig(value, path);
    return [[path, value]];
  });
}

function coerceConfigValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function objectNumber(value: string): string {
  const match = value.match(/(\d+)(?:\D*)$/) ?? value.match(/(?:issues|pulls|prs?)\/(\d+)/i);
  return match ? match[1] : value;
}

function shellWords(input: string): string[] {
  const words = input.match(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|\S+/g) ?? [];
  return words.map((word) => word.replace(/^['"]|['"]$/g, "").replace(/\\"/g, "\"").replace(/\\'/g, "'"));
}

function ctxArgs(ctx: GitCodeContext): string[] {
  return [
    ...(ctx.repo ? ["-R", ctx.repo] : []),
    ...(ctx.hostname !== defaultHost ? ["--hostname", ctx.hostname] : []),
    ...(ctx.json ? ["--json", ...(ctx.jsonFields?.length ? [ctx.jsonFields.join(",")] : [])] : []),
    ...(ctx.jq ? ["--jq", ctx.jq] : []),
    ...(ctx.template ? ["--template", ctx.template] : []),
    ...(ctx.web ? ["--web"] : [])
  ];
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function bodyFromArgs(args: string[]): Promise<string | undefined> {
  return takeOption(args, "--body") ?? await bodyFromFile(args);
}

async function bodyFromFile(args: string[]): Promise<string | undefined> {
  const file = takeOption(args, "--body-file");
  return file ? readFile(file, "utf8") : undefined;
}

async function bodyFromFileAlias(args: string[], name: string): Promise<string | undefined> {
  const file = takeOption(args, name);
  return file ? readFile(file, "utf8") : undefined;
}

async function optionalArray(path: string): Promise<unknown[]> {
  return ensureArray(await apiRequest(path, {}).catch(() => []));
}

async function prDiffRange(repo: RepoRef, number: string): Promise<string> {
  const pr = normalizePull(await apiRequest(`${repoApiPath(repo)}/pulls/${number}`, {}), repo);
  return `${pr.baseRefName}...${pr.headRefName}`;
}

async function currentBranch(): Promise<string> {
  return (await runProcess(gitBin(), ["branch", "--show-current"], { capture: true })).trim();
}

function takeOption(args: string[], ...names: string[]): string | undefined {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0) {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) throw new CliError(`Missing value for ${name}`);
      args.splice(index, 2);
      return value;
    }
  }
  return undefined;
}

function takeMany(args: string[], name: string): string[] {
  const values: string[] = [];
  for (;;) {
    const value = takeOption(args, name);
    if (!value) return values;
    values.push(value);
  }
}

function takeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function needOptionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) throw new CliError(`Missing value for ${name}`);
  return value;
}

function needArg(value: string | undefined, usage: string): string {
  if (!value) throw new CliError(usage);
  return value;
}

function parseKeyValue(value: string): Record<string, string> {
  const index = value.indexOf("=");
  if (index < 0) throw new CliError(`Expected key=value: ${value}`);
  return { [value.slice(0, index)]: value.slice(index + 1) };
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && (!Array.isArray(item) || item.length > 0)));
}

function ensureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function configDir(): string {
  return process.env.GITCODE_CONFIG_DIR ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "gitcode");
}

async function getAuth(host: string): Promise<{ token?: string; source: string }> {
  for (const name of ["GITCODE_TOKEN", "GC_TOKEN", "GITCODE_ACCESS_TOKEN"]) {
    if (process.env[name]) return { token: process.env[name], source: name };
  }
  const hosts = await readHosts();
  const token = asRecord(hosts[host]).token;
  return typeof token === "string" ? { token, source: "store" } : { source: "none" };
}

async function readHosts(): Promise<Record<string, unknown>> {
  const path = join(configDir(), "hosts.json");
  const raw = await readFile(path, "utf8").catch(() => "{}");
  return asRecord(JSON.parse(raw));
}

async function saveHostToken(host: string, token: string): Promise<void> {
  const path = join(configDir(), "hosts.json");
  const hosts = await readHosts();
  hosts[host] = { token };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(hosts, null, 2)}\n`, "utf8");
}

async function removeHostToken(host: string): Promise<void> {
  const path = join(configDir(), "hosts.json");
  const hosts = await readHosts();
  delete hosts[host];
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(hosts, null, 2)}\n`, "utf8");
}

async function readDefaultRepo(): Promise<string | undefined> {
  const raw = await readFile(".gitcode/config.json", "utf8").catch(() => undefined);
  if (!raw) return undefined;
  const config = asRecord(JSON.parse(raw));
  return typeof config.defaultRepo === "string" ? config.defaultRepo : undefined;
}

async function readUserConfig(): Promise<Record<string, unknown>> {
  const raw = await readFile(join(configDir(), "config.json"), "utf8").catch(() => "{}");
  return asRecord(JSON.parse(raw));
}

async function writeUserConfig(config: Record<string, unknown>): Promise<void> {
  const path = join(configDir(), "config.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function readAlias(name: string): Promise<string | undefined> {
  const aliases = asRecord((await readUserConfig()).aliases);
  const expansion = aliases[name];
  return typeof expansion === "string" ? expansion : undefined;
}

async function findExecutable(name: string): Promise<string | undefined> {
  const paths = (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").filter(Boolean);
  const candidates = process.platform === "win32" ? [name, `${name}.cmd`, `${name}.exe`] : [name];
  for (const dir of paths) {
    for (const candidate of candidates) {
      const path = join(dir, candidate);
      if (await access(path).then(() => true).catch(() => false)) return path;
    }
  }
  return undefined;
}

async function saveDefaultRepo(repo: RepoRef): Promise<void> {
  await mkdir(".gitcode", { recursive: true });
  await writeFile(".gitcode/config.json", `${JSON.stringify({ defaultRepo: `${repo.owner}/${repo.repo}`, host: repo.host }, null, 2)}\n`, "utf8");
}

function gitBin(): string {
  return process.env.GITCODE_GIT_BIN ?? "git";
}

async function runProcess(command: string, args: string[], options: { capture?: boolean } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code === 0) resolve(out);
      else reject(new CliError(`${command} ${args.join(" ")} failed with exit code ${code}${err ? `: ${err.trim()}` : ""}`));
    });
  });
}

async function openUrl(url: string): Promise<void> {
  if (process.env.GITCODE_NO_BROWSER === "1") {
    console.log(url);
    return;
  }
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  await runProcess(opener, args);
}

function help(command?: string, subcommand?: string): void {
  const topic = [command, subcommand].filter(Boolean).join(" ");
  const topics: Record<string, string> = {
    auth: "Usage: gc auth <login|status|token|logout|setup-git>\n\nExamples:\n  gc auth login --with-token < token.txt\n  gc auth status --json",
    api: "Usage: gc api <path> [-X METHOD] [-f key=value] [-F key=@file] [--input file.json] [--paginate]\n\nExamples:\n  gc api repos/gcw_CSGJYRfL/test/issues\n  gc api -X POST repos/OWNER/REPO/issues -f title=hello",
    repo: "Usage: gc repo <list|view|clone|set-default|create|fork|sync>\n\nExamples:\n  gc repo view -R gcw_CSGJYRfL/test --json name,defaultBranchRef\n  gc repo clone gcw_CSGJYRfL/test -- --depth 1",
    issue: "Usage: gc issue <list|view|create|edit|close|reopen|comment>\n\nExamples:\n  gc issue list -R OWNER/REPO --state open --label bug\n  gc issue create --title 'Bug' --body-file issue.md",
    pr: "Usage: gc pr <list|view|create|checkout|diff|status|comment|review|merge|close|reopen>\n\nExamples:\n  gc pr list --state open --base main\n  gc pr merge 12 --squash --delete-branch",
    label: "Usage: gc label <list|create|edit|delete>",
    release: "Usage: gc release <list|view|create|delete>",
    search: "Usage: gc search <repos|issues|prs> QUERY [--state STATE] [--owner OWNER] [-R OWNER/REPO]",
    browse: "Usage: gc browse [issues|issues/N|pulls/N|releases/TAG|tree/BRANCH|blob/BRANCH/PATH]",
    config: "Usage: gc config <get|set|list>",
    alias: "Usage: gc alias <set|list|delete>",
    completion: "Usage: gc completion [bash|zsh|fish]"
  };
  if (topic && topics[topic]) {
    console.log(topics[topic]);
    return;
  }
  if (command && topics[command]) {
    console.log(topics[command]);
    return;
  }
  console.log(`GitCode CLI

Commands:
  auth login --with-token
  auth status|token|logout|setup-git
  api <path> [-X METHOD] [-f key=value] [--input file.json] [--paginate]
  repo list|view|clone|set-default|create|fork|sync
  issue list|view|create|edit|close|reopen|comment
  pr list|view|create|checkout|diff|status|comment|review|merge|close|reopen
  label list|create|edit|delete
  release list|view|create|delete
  search repos|issues|prs
  browse [issues|issues/N|pulls|pulls/N|tree/BRANCH/PATH]
  config get|set|list
  alias set|list|delete
  completion [bash|zsh|fish]

Global options:
  -R, --repo OWNER/REPO
  --hostname HOST
  --json [fields]
  --jq expression
  --template string
  --web
  --help
  --version

Unsupported GitHub-only commands fail with a clear error. External extensions named gc-<command> on PATH are executed for custom workflows.
`);
}

export async function clearGitCodeTestConfig(): Promise<void> {
  await rm(configDir(), { recursive: true, force: true });
}
