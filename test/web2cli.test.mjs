import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { analyzeTarget } from "../dist/analyzer.js";
import { renderDesign } from "../dist/designer.js";
import { scaffoldCli } from "../dist/generator.js";
import { loadSpec, saveSpec } from "../dist/spec.js";

const execFileAsync = promisify(execFile);

async function makeApp() {
  const root = await mkdtemp(join(tmpdir(), "web2cli-"));
  await mkdir(join(root, "app/users/[id]"), { recursive: true });
  await mkdir(join(root, "app/api/users"), { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    dependencies: { next: "latest", react: "latest" },
    scripts: { dev: "next dev", build: "next build" }
  }));
  await writeFile(join(root, "app/users/[id]/page.tsx"), "export default function Page() {}");
  await writeFile(join(root, "app/api/users/route.ts"), "export async function GET() { return fetch('/api/profile') }");
  await writeFile(join(root, "src/login.html"), "<form action='/login' method='post'><input name='email' required><input name='password' type='password'></form>");
  return root;
}

test("analyzes local web projects", async () => {
  const root = await makeApp();
  const spec = await analyzeTarget(root);
  assert.equal(spec.name.startsWith("web2cli-"), true);
  assert.equal(spec.frameworks.includes("Next.js"), true);
  assert.equal(spec.packageScripts.dev, "next dev");
  assert.equal(spec.routes.some((route) => route.path === "/users/:id"), true);
  assert.equal(spec.apiEndpoints.some((endpoint) => endpoint.path === "/api/users"), true);
  assert.equal(spec.apiEndpoints.some((endpoint) => endpoint.path === "/api/profile"), true);
  assert.equal(spec.forms[0].action, "/login");
});

test("round-trips spec and renders design", async () => {
  const root = await makeApp();
  const spec = await analyzeTarget(root, { name: "sample-web" });
  const specPath = join(root, "web2cli-spec.json");
  await saveSpec(spec, specPath);
  const loaded = await loadSpec(specPath);
  assert.deepEqual(loaded, spec);
  const design = renderDesign(loaded);
  assert.match(design, /Command Groups/);
  assert.match(design, /\/users\/:id/);
});

test("scaffolds a generated TypeScript CLI", async () => {
  const root = await makeApp();
  const spec = await analyzeTarget(root, { name: "sample-web" });
  const out = join(root, "generated");
  const result = await scaffoldCli(spec, out);
  assert.equal(result.command, "cli-anything-sample-web");
  assert.match(await readFile(join(out, "src/cli.ts"), "utf8"), /Generated/);
});

test("CLI analyze/design/scaffold smoke", async () => {
  const root = await makeApp();
  const specPath = join(root, "spec.json");
  const designPath = join(root, "DESIGN.md");
  const generated = join(root, "generated");
  const cli = ["dist/cli.js"];

  const analyzed = await execFileAsync(process.execPath, [...cli, "--json", "analyze", root, "-o", specPath, "--name", "sample-web"], { cwd: process.cwd() });
  assert.equal(JSON.parse(analyzed.stdout).specPath, specPath);

  await execFileAsync(process.execPath, [...cli, "design", specPath, "-o", designPath], { cwd: process.cwd() });
  await execFileAsync(process.execPath, [...cli, "scaffold", specPath, "-o", generated], { cwd: process.cwd() });
  assert.match(await readFile(join(generated, "package.json"), "utf8"), /cli-anything-sample-web/);
});

