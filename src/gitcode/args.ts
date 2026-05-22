export interface GitCodeContext {
  repo?: string;
  hostname: string;
  json: boolean;
  jsonFields?: string[];
  jq?: string;
  template?: string;
  web: boolean;
}

export function parseGlobalArgs(argv: string[], defaultHost: string, nonJsonValues: Set<string>): { ctx: GitCodeContext; args: string[] } {
  const args = [...argv];
  const ctx: GitCodeContext = {
    hostname: process.env.GITCODE_HOST ?? process.env.GC_HOST ?? defaultHost,
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
    if (arg.startsWith("-R=") || arg.startsWith("--repo=")) {
      ctx.repo = arg.slice(arg.indexOf("=") + 1);
      args.splice(i, 1);
      continue;
    }
    if (arg === "--hostname") {
      ctx.hostname = needOptionValue(args, i, arg);
      args.splice(i, 2);
      continue;
    }
    if (arg.startsWith("--hostname=")) {
      ctx.hostname = arg.slice("--hostname=".length);
      args.splice(i, 1);
      continue;
    }
    if (arg === "--json" || arg.startsWith("--json=")) {
      ctx.json = true;
      const inlineFields = arg.startsWith("--json=") ? arg.slice("--json=".length) : undefined;
      if (inlineFields !== undefined) {
        ctx.jsonFields = jsonFields(inlineFields);
        args.splice(i, 1);
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith("-") && !nonJsonValues.has(next)) {
          ctx.jsonFields = jsonFields(next);
          args.splice(i, 2);
        } else {
          args.splice(i, 1);
        }
      }
      continue;
    }
    if (arg === "--jq" || arg === "-q") {
      ctx.jq = needOptionValue(args, i, arg);
      args.splice(i, 2);
      continue;
    }
    if (arg.startsWith("--jq=")) {
      ctx.jq = arg.slice("--jq=".length);
      args.splice(i, 1);
      continue;
    }
    if (arg === "--template") {
      ctx.template = needOptionValue(args, i, arg);
      args.splice(i, 2);
      continue;
    }
    if (arg.startsWith("--template=")) {
      ctx.template = arg.slice("--template=".length);
      args.splice(i, 1);
      continue;
    }
    if (arg === "--web" || arg === "-w") {
      ctx.web = true;
      args.splice(i, 1);
      continue;
    }
    i += 1;
  }
  return { ctx, args };
}

export function takesValue(flag: string | undefined): boolean {
  return flag === "-R" || flag === "--repo" || flag === "--hostname" || flag === "--json" || flag === "--jq" || flag === "-q" || flag === "--template";
}

export function takeOption(args: string[], ...names: string[]): string | undefined {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0) {
      const value = args[index + 1];
      if (!value || value.startsWith("-") && value !== "-") throw new Error(`Missing value for ${name}`);
      args.splice(index, 2);
      return value;
    }
    const prefix = `${name}=`;
    const inlineIndex = args.findIndex((arg) => arg.startsWith(prefix));
    if (inlineIndex >= 0) {
      const value = args[inlineIndex].slice(prefix.length);
      if (!value) throw new Error(`Missing value for ${name}`);
      args.splice(inlineIndex, 1);
      return value;
    }
  }
  return undefined;
}

export function takeMany(args: string[], ...names: string[]): string[] {
  const values: string[] = [];
  for (;;) {
    const value = takeOption(args, ...names);
    if (!value) return values;
    values.push(value);
  }
}

export function takeFlag(args: string[], ...names: string[]): boolean {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0) {
      args.splice(index, 1);
      return true;
    }
  }
  return false;
}

export function needOptionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-") && value !== "-") throw new Error(`Missing value for ${name}`);
  return value;
}

export function expandAlias(expansion: string, args: string[]): string[] {
  const words = shellWords(expansion);
  let highestPlaceholder = 0;
  const expanded = words.map((word) => word.replace(/\$(\d+)/g, (_match, indexText: string) => {
    const index = Number(indexText);
    highestPlaceholder = Math.max(highestPlaceholder, index);
    return args[index - 1] ?? "";
  })).filter((word) => word !== "");
  return highestPlaceholder > 0 ? [...expanded, ...args.slice(highestPlaceholder)] : [...expanded, ...args];
}

function jsonFields(value: string): string[] {
  return value.split(",").map((field) => field.trim()).filter(Boolean);
}

function shellWords(input: string): string[] {
  const words = input.match(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|\S+/g) ?? [];
  return words.map((word) => word.replace(/^['"]|['"]$/g, "").replace(/\\"/g, "\"").replace(/\\'/g, "'"));
}
