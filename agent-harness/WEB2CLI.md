# Web2CLI Harness

This harness adapts the core ideas from HKUDS/CLI-Anything to web applications
using a TypeScript/Node toolchain.

## Capability Model

The upstream CLI-Anything project provides a repeatable workflow for converting
human-facing software into agent-facing command line tools:

1. analyze the target application architecture;
2. map UI actions to backend APIs or files;
3. design command groups and state;
4. implement a CLI with JSON output and REPL mode;
5. plan tests before writing code;
6. verify with unit and end-to-end tests;
7. publish a discoverable `SKILL.md`.

For web applications, the same pattern becomes:

1. find framework and runtime signals;
2. discover routes, server handlers, OpenAPI descriptions, fetch calls, and forms;
3. group discovered capabilities into CLI verbs;
4. generate a runnable CLI wrapper that can call HTTP endpoints and expose forms;
5. keep a JSON spec as the contract between analysis and generated code.

## Workflow

```bash
cli-anything-web2cli analyze <url-or-local-web-project> -o web2cli-spec.json
cli-anything-web2cli design web2cli-spec.json -o WEB2CLI.md
cli-anything-web2cli scaffold web2cli-spec.json -o generated
cd generated && pip install -e .
```

## Generated CLI Shape

Generated packages expose:

- `status` for target metadata;
- `routes list` for discovered UI routes;
- `api list` and `api call` for endpoint-oriented workflows;
- `forms list` for form actions and fields;
- `request get/post` for general HTTP access;
- `repl` as a lightweight interactive mode;
- `--json` on the root command for machine-readable output.

The generated CLI is intentionally conservative. It wraps discovered HTTP
surface area instead of inventing business rules.
