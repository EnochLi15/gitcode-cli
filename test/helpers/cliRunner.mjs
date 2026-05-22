import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export const cliPath = join(process.cwd(), "dist/cli.js");

export async function runCli(args, options = {}) {
  const child = spawn(process.execPath, [cliPath, ...args], {
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

export function stdoutJson(result) {
  return JSON.parse(result.stdout);
}

export function isolatedEnv(extra = {}) {
  return {
    GITCODE_CONFIG_DIR: join(tmpdir(), `gitcode-cli-e2e-${Date.now()}-${Math.random()}`),
    GITCODE_NO_BROWSER: "1",
    ...extra
  };
}

export async function tempWorkspace(prefix = "gitcode-cli-e2e-") {
  return mkdtemp(join(tmpdir(), prefix));
}

export function liveTokenEnv(extra = {}) {
  const token = process.env.GITCODE_TOKEN ?? process.env.GC_TOKEN ?? process.env.GITCODE_ACCESS_TOKEN;
  return isolatedEnv({
    GITCODE_API_BASE: process.env.GITCODE_API_BASE ?? "https://api.gitcode.com/api/v5",
    ...(token ? { GITCODE_TOKEN: token } : {}),
    ...extra
  });
}
