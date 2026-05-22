import assert from "node:assert/strict";
import { test } from "node:test";
import { liveTokenEnv, runCli, stdoutJson } from "./helpers/cliRunner.mjs";

test("live GitCode repo create E2E is opt-in and cleanup-oriented", { skip: process.env.GITCODE_LIVE_REPO_CREATE !== "1" }, async (t) => {
  if (!(process.env.GITCODE_TOKEN || process.env.GC_TOKEN || process.env.GITCODE_ACCESS_TOKEN)) {
    t.skip("GITCODE_LIVE_REPO_CREATE requires GITCODE_TOKEN, GC_TOKEN, or GITCODE_ACCESS_TOKEN");
    return;
  }
  const marker = `gc-cli-e2e-${Date.now()}`;
  const env = liveTokenEnv();
  const create = await runCli(["repo", "create", marker, "--private", "--description", "temporary gitcode-cli live E2E repository", "--json", "fullName"], { env });
  if (create.code !== 0) {
    t.skip(`GitCode repo create endpoint unavailable or token lacks permission: ${create.stderr || create.stdout}`);
    return;
  }
  const fullName = stdoutJson(create).fullName;
  assert.match(fullName, new RegExp(`/${marker}$`));
  try {
    const view = await runCli(["repo", "view", "-R", fullName, "--json", "fullName"], { env });
    assert.equal(view.code, 0, view.stderr || view.stdout);
    assert.equal(stdoutJson(view).fullName, fullName);
  } finally {
    const cleanup = await runCli(["api", "-X", "DELETE", `repos/${fullName}`], { env });
    assert.equal(cleanup.code, 0, `cleanup failed for ${fullName}; remove it manually. stdout=${cleanup.stdout} stderr=${cleanup.stderr}`);
  }
});
