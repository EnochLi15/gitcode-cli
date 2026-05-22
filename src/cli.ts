#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { analyzeTarget } from "./analyzer.js";
import { renderDesign } from "./designer.js";
import { scaffoldCli } from "./generator.js";
import { emitGitCodeError, isGitCodeCommand, runGitCodeCli } from "./gitcodeCli.js";
import { loadSpec, saveSpec } from "./spec.js";

let jsonOutput = false;

function emit(data: unknown, message?: string): void {
  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (message) console.log(message);
  if (typeof data === "string") console.log(data);
  else console.log(JSON.stringify(data, null, 2));
}

function fail(message: string): never {
  if (jsonOutput) console.log(JSON.stringify({ error: message }));
  else console.error(`Error: ${message}`);
  process.exit(1);
}

async function main(argv: string[]): Promise<void> {
  if (isGitCodeCommand(argv)) return runGitCodeCli(argv);
  const args = [...argv];
  while (args[0]?.startsWith("--")) {
    const flag = args.shift();
    if (flag === "--json") jsonOutput = true;
    else if (flag === "--help" || flag === "-h") return help();
    else if (flag === "--version") return console.log("0.1.1");
    else fail(`Unknown option: ${flag}`);
  }
  const command = args.shift();
  if (!command) return repl();
  if (command === "analyze") return analyzeCommand(args);
  if (command === "design") return designCommand(args);
  if (command === "scaffold") return scaffoldCommand(args);
  if (command === "repl") return repl();
  return runGitCodeCli(argv);
}

async function analyzeCommand(args: string[]): Promise<void> {
  const target = args.shift();
  if (!target) fail("Usage: analyze <url-or-local-web-project> [-o spec.json] [--name name]");
  const outputPath = takeOption(args, "-o", "--output") ?? "web2cli-spec.json";
  const name = takeOption(args, "--name");
  const timeoutSeconds = Number(takeOption(args, "--timeout") ?? "20");
  const spec = await analyzeTarget(target, { name, timeoutMs: timeoutSeconds * 1000 });
  const specPath = await saveSpec(spec, outputPath);
  emit({ specPath, ...spec }, `Wrote web2cli spec: ${specPath}`);
}

async function designCommand(args: string[]): Promise<void> {
  const specPath = args.shift();
  if (!specPath) fail("Usage: design <spec.json> [-o WEB2CLI.md]");
  const outputPath = takeOption(args, "-o", "--output") ?? "WEB2CLI.md";
  const spec = await loadSpec(specPath);
  const design = renderDesign(spec);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, design, "utf8");
  emit({ designPath: outputPath, bytes: Buffer.byteLength(design) }, `Wrote design: ${outputPath}`);
}

async function scaffoldCommand(args: string[]): Promise<void> {
  const specPath = args.shift();
  if (!specPath) fail("Usage: scaffold <spec.json> [-o generated-web-cli] [--package-name name]");
  const outputDir = takeOption(args, "-o", "--output-dir") ?? "generated-web-cli";
  const packageName = takeOption(args, "--package-name");
  const spec = await loadSpec(specPath);
  const result = await scaffoldCli(spec, outputDir, { packageName });
  emit(result, `Generated TypeScript CLI package: ${result.outputDir}`);
}

function takeOption(args: string[], ...names: string[]): string | undefined {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0) {
      const value = args[index + 1];
      args.splice(index, 2);
      return value;
    }
  }
  return undefined;
}

function help(): void {
  console.log(`gitcode-cli

GitCode commands:
  auth, api, repo, issue, pr, file, org, ssh-key, workflow
  label, release, search, browse, config, alias, completion

web2cli commands:
  analyze <url-or-local-web-project> [-o spec.json] [--name name]
  design <spec.json> [-o WEB2CLI.md]
  scaffold <spec.json> [-o generated-web-cli] [--package-name name]
  repl

web2cli global options:
  --json
  --help
  --version
`);
}

async function repl(): Promise<void> {
  const rl = createInterface({ input, output });
  console.log("cli-anything-web2cli> type help or quit");
  for (;;) {
    const line = (await rl.question("> ")).trim();
    if (!line) continue;
    if (line === "quit" || line === "exit") break;
    if (line === "help") {
      help();
      continue;
    }
    await main(line.split(/\s+/));
  }
  rl.close();
}

main(process.argv.slice(2)).catch((error) => {
  if (isGitCodeCommand(process.argv.slice(2))) emitGitCodeError(process.argv.slice(2), error);
  fail(error instanceof Error ? error.message : String(error));
});
