import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { ghContractCases } from "./contracts/ghContractCases.mjs";
import { runCli, isolatedEnv, stdoutJson, tempWorkspace } from "./helpers/cliRunner.mjs";
import { contractHandler, withMockGitCodeServer } from "./helpers/mockGitcodeServer.mjs";

test("GitHub CLI compatibility contract matrix", async (t) => {
  for (const item of ghContractCases) {
    await t.test(item.name, async () => {
      const mismatches = [];
      await withMockGitCodeServer(contractHandler(item.requests, mismatches), async ({ base, requests }) => {
        const cwd = await tempWorkspace("gitcode-contract-e2e-");
        const env = isolatedEnv({ GITCODE_API_BASE: base, ...(item.env ?? {}) });
        for (const file of item.files ?? []) {
          const path = join(cwd, file.path);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, file.content, "utf8");
        }
        for (const setup of item.setup ?? []) {
          const setupResult = await runCli(setup.argv, { env, cwd, input: setup.input });
          assertResult(setupResult, setup.expect ?? { code: 0 });
        }
        const result = await runCli(item.argv, {
          env,
          cwd,
          input: item.input
        });
        assert.deepEqual(mismatches, [], "HTTP request contract mismatches");
        assertResult(result, item.expect);
        assert.equal(requests.length, item.requests.length, "all expected requests were consumed");
      });
    });
  }
});

function assertResult(result, expect) {
  assert.equal(result.code, expect.code, `exit code\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  if ("stdout" in expect) assert.equal(result.stdout, expect.stdout);
  if ("stderr" in expect) assert.equal(result.stderr, expect.stderr);
  if ("stdoutJson" in expect) assert.deepEqual(stdoutJson(result), expect.stdoutJson);
  if (expect.stdoutIncludes) assert.match(result.stdout, new RegExp(escapeRegExp(expect.stdoutIncludes)));
  if (expect.stderrIncludes) assert.match(result.stderr, new RegExp(escapeRegExp(expect.stderrIncludes)));
  if (expect.stdoutMatches) assert.match(result.stdout, new RegExp(expect.stdoutMatches));
  if (expect.stderrMatches) assert.match(result.stderr, new RegExp(expect.stderrMatches));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
