import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function createMockGit(cwd, options = {}) {
  const logPath = join(cwd, "git-args.log");
  const statePath = join(cwd, "git-state");
  const scriptPath = join(cwd, "git-mock.sh");
  const branch = options.branch ?? "feature";
  const remoteUrl = options.remoteUrl ?? "https://gitcode.com/OWNER/REPO.git";
  await writeFile(scriptPath, `#!/bin/sh
printf '%s\\n' "$@" >> "${logPath}"
if [ "$1" = "branch" ]; then echo "${branch}"; exit 0; fi
if [ "$1" = "status" ]; then echo "${options.status ?? ""}"; exit 0; fi
if [ "$1" = "remote" ] && [ "$2" = "get-url" ]; then
  if [ -f "${statePath}" ]; then echo "${remoteUrl}"; exit 0; fi
  exit 1
fi
if [ "$1" = "remote" ] && [ "$2" = "add" ]; then touch "${statePath}"; exit 0; fi
exit 0
`, "utf8");
  if (options.remoteExists) await writeFile(statePath, "1", "utf8");
  await chmod(scriptPath, 0o755);
  return {
    bin: scriptPath,
    logPath,
    async log() {
      return readFile(logPath, "utf8").catch(() => "");
    }
  };
}
