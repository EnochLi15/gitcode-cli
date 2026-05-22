import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { WebSpec } from "./types.js";

export async function loadSpec(path: string): Promise<WebSpec> {
  return JSON.parse(await readFile(path, "utf8")) as WebSpec;
}

export async function saveSpec(spec: WebSpec, path: string): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  return path;
}

