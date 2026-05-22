import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { probeHtml } from "./htmlProbe.js";
import type { ApiEndpointSpec, RouteSpec, WebSpec } from "./types.js";

const textExtensions = new Set([".html", ".htm", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".py", ".rb", ".go"]);
const ignoredDirs = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", "coverage", "__pycache__"]);
const routeFileRe = /(?:^|[/\\])(app|pages|routes)[/\\](.+?)(?:[/\\](?:page|route|index))?\.(tsx|ts|jsx|js|vue|svelte)$/;
const fetchRe = /\b(fetch|axios\.(get|post|put|patch|delete))\(\s*["']([^"']+)["']/g;
const expressRe = /\b(app|router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
const flaskRe = /@(?:app|bp)\.route\(\s*["']([^"']+)["'](?:[^)]*methods\s*=\s*\[([^\]]+)])?/g;

export interface AnalyzeOptions {
  name?: string;
  timeoutMs?: number;
}

export async function analyzeTarget(target: string, options: AnalyzeOptions = {}): Promise<WebSpec> {
  if (isUrl(target)) {
    return analyzeUrl(target, options);
  }
  return analyzeLocal(resolve(target), options);
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function cleanName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "web-app";
}

async function analyzeUrl(target: string, options: AnalyzeOptions): Promise<WebSpec> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const response = await fetch(target, {
      headers: { "user-agent": "cli-anything-web2cli/0.1" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${target}`);
    }
    const html = await response.text();
    const url = new URL(target);
    const probe = probeHtml(html, target);
    return {
      target,
      targetType: "url",
      name: cleanName(options.name ?? url.hostname),
      baseUrl: `${url.protocol}//${url.host}`,
      frameworks: [],
      packageScripts: {},
      routes: dedupeRoutes(probe.routes),
      apiEndpoints: [],
      forms: probe.forms,
      openapiFiles: [],
      notes: ["URL analysis uses static HTML only. Run against source code for deeper route and API discovery."]
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzeLocal(root: string, options: AnalyzeOptions): Promise<WebSpec> {
  const rootStat = await stat(root).catch(() => undefined);
  if (!rootStat?.isDirectory()) {
    throw new Error(`Target path is not a directory: ${root}`);
  }
  const spec: WebSpec = {
    target: root,
    targetType: "local",
    name: cleanName(options.name ?? basename(root)),
    frameworks: [],
    packageScripts: {},
    routes: [],
    apiEndpoints: [],
    forms: [],
    openapiFiles: [],
    notes: []
  };
  await readPackageJson(root, spec);
  await detectFrameworkFiles(root, spec);
  for await (const file of walk(root)) {
    const rel = relative(root, file).split(sep).join("/");
    const ext = extname(file).toLowerCase();
    if (isOpenApiFile(rel)) spec.openapiFiles.push(rel);
    if (!textExtensions.has(ext)) continue;
    const text = await readFile(file, "utf8").catch(() => "");
    scanRouteFile(rel, spec);
    scanHtml(rel, text, spec);
    scanApiPatterns(rel, text, spec);
  }
  spec.routes = dedupeRoutes(spec.routes);
  spec.apiEndpoints = dedupeEndpoints(spec.apiEndpoints);
  if (!spec.routes.length && !spec.apiEndpoints.length && !spec.forms.length) {
    spec.notes.push("No routes, API endpoints, or forms were detected from static source scanning.");
  }
  return spec;
}

async function readPackageJson(root: string, spec: WebSpec): Promise<void> {
  const path = `${root}/package.json`;
  const raw = await readFile(path, "utf8").catch(() => undefined);
  if (!raw) return;
  try {
    const pkg = JSON.parse(raw) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    spec.packageScripts = pkg.scripts ?? {};
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const known: Record<string, string> = {
      next: "Next.js",
      react: "React",
      vue: "Vue",
      svelte: "Svelte",
      "@sveltejs/kit": "SvelteKit",
      express: "Express",
      fastify: "Fastify",
      astro: "Astro",
      nuxt: "Nuxt",
      vite: "Vite"
    };
    for (const [dep, framework] of Object.entries(known)) {
      if (deps[dep] && !spec.frameworks.includes(framework)) spec.frameworks.push(framework);
    }
  } catch (error) {
    spec.notes.push(`Could not parse package.json: ${(error as Error).message}`);
  }
}

async function detectFrameworkFiles(root: string, spec: WebSpec): Promise<void> {
  const markers: Record<string, string> = {
    "next.config.js": "Next.js",
    "next.config.mjs": "Next.js",
    "vite.config.js": "Vite",
    "vite.config.ts": "Vite",
    "nuxt.config.ts": "Nuxt",
    "svelte.config.js": "SvelteKit",
    "astro.config.mjs": "Astro"
  };
  for (const [file, framework] of Object.entries(markers)) {
    const exists = await stat(`${root}/${file}`).then((s) => s.isFile(), () => false);
    if (exists && !spec.frameworks.includes(framework)) spec.frameworks.push(framework);
  }
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

function isOpenApiFile(rel: string): boolean {
  const lower = rel.toLowerCase();
  return lower.endsWith("openapi.json") || lower.endsWith("swagger.json") || /openapi.*\.ya?ml$/.test(lower);
}

function scanRouteFile(rel: string, spec: WebSpec): void {
  const match = routeFileRe.exec(rel);
  if (!match) return;
  const bits = (match[2] ?? "").split("/");
  const clean = bits
    .filter((part) => !["index", "page", "route"].includes(part))
    .map((part) => part.startsWith("[") && part.endsWith("]") ? `:${part.slice(1, -1)}` : part);
  const path = `/${clean.filter(Boolean).join("/")}` || "/";
  const kind = rel.startsWith("app/api/") || rel.startsWith("pages/api/") || rel.includes("/api/") ? "api" : "page";
  if (kind === "api") {
    spec.apiEndpoints.push({ method: "GET", path, source: rel });
  } else {
    spec.routes.push({ method: "GET", path, source: rel, kind: "page" });
  }
}

function scanHtml(rel: string, text: string, spec: WebSpec): void {
  if (!text.includes("<form") && !text.includes("<a ")) return;
  const probe = probeHtml(text, rel);
  spec.routes.push(...probe.routes);
  spec.forms.push(...probe.forms);
}

function scanApiPatterns(rel: string, text: string, spec: WebSpec): void {
  for (const match of text.matchAll(fetchRe)) {
    const method = (match[2] ?? "get").toUpperCase();
    spec.apiEndpoints.push({ method, path: match[3] ?? "/", source: rel });
  }
  for (const match of text.matchAll(expressRe)) {
    spec.apiEndpoints.push({ method: (match[2] ?? "get").toUpperCase(), path: match[3] ?? "/", source: rel });
  }
  for (const match of text.matchAll(flaskRe)) {
    const methods = [...(match[2] ?? "").matchAll(/["']([A-Z]+)["']/g)].map((item) => item[1]);
    for (const method of methods.length ? methods : ["GET"]) {
      spec.apiEndpoints.push({ method, path: match[1] ?? "/", source: rel });
    }
  }
}

function dedupeRoutes(routes: RouteSpec[]): RouteSpec[] {
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = `${route.method}:${route.kind}:${route.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeEndpoints(endpoints: ApiEndpointSpec[]): ApiEndpointSpec[] {
  const seen = new Set<string>();
  return endpoints.filter((endpoint) => {
    const key = `${endpoint.method}:${endpoint.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function targetToFileUrl(target: string): string {
  return isUrl(target) ? target : pathToFileURL(resolve(target)).toString();
}

