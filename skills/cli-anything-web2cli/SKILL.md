---
name: cli-anything-web2cli
description: Use this skill to analyze a web app or URL and generate an agent-friendly TypeScript CLI wrapper from it.
---

# cli-anything-web2cli

Use this when turning a web application into a CLI surface for agents.

## Workflow

```bash
npm install
npm run build
cli-anything-web2cli analyze <url-or-local-web-project> -o web2cli-spec.json
cli-anything-web2cli design web2cli-spec.json -o WEB2CLI.md
cli-anything-web2cli scaffold web2cli-spec.json -o generated-web-cli
```

Use `--json` for parseable output:

```bash
cli-anything-web2cli --json analyze ./web-app -o web2cli-spec.json
```

## What It Extracts

- framework signals from `package.json` and config files;
- package scripts;
- app/page route files from common web frameworks;
- `fetch(...)`, `axios.*(...)`, Express, and Flask endpoint hints;
- HTML links and forms;
- OpenAPI/Swagger file locations.

## Generated CLI

The generated CLI exposes `status`, `routes list`, `api list`, `api call`,
`forms list`, `request get`, `request post`, and `repl`.

The generated package is also TypeScript/Node: it includes `package.json`,
`tsconfig.json`, `src/cli.ts`, `src/spec.ts`, and its own `SKILL.md`.
