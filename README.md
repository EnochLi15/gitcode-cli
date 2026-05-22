# gitcode-cli

This repository contains a TypeScript GitCode CLI plus a CLI-Anything-inspired
harness for turning web applications into agent-friendly command line tools.

The GitCode command surface is available as `gc` and `gitcode`:

```bash
npm install
npm run build
npm link
gc api repos/gcw_CSGJYRfL/test/issues
gc issue list -R gcw_CSGJYRfL/test --json number,title
gc pr list -R gcw_CSGJYRfL/test --state open
gc browse -R gcw_CSGJYRfL/test issues
```

Authentication can come from `GITCODE_TOKEN`, `GC_TOKEN`, or
`GITCODE_ACCESS_TOKEN`, or from the saved auth store:

```bash
gc auth login --with-token < token.txt
gc auth status
```

The original web-to-CLI tool is still available as `cli-anything-web2cli`:

```bash
cli-anything-web2cli analyze ./my-web-app -o web2cli-spec.json
cli-anything-web2cli design web2cli-spec.json -o WEB2CLI.md
cli-anything-web2cli scaffold web2cli-spec.json -o generated-web-cli
```

It accepts either a local web project directory or an HTTP(S) URL. The analyzer
extracts routes, API endpoint hints, HTML forms, package scripts, framework
signals, and OpenAPI files. The scaffolder turns that spec into a small Node CLI
package with JSON output, request helpers, form inventory, endpoint
inventory, and an interactive REPL.

## Testing

Default tests build the TypeScript project and use mock HTTP servers, so they do
not mutate live GitCode data:

```bash
npm test
```

Read-only live smoke tests are opt-in and target
`https://gitcode.com/gcw_CSGJYRfL/test`:

```bash
GITCODE_LIVE=1 npm test
```

Without a token, the live smoke covers public read endpoints such as issues,
pull requests, and releases. GitCode currently requires a private token for the
repository metadata endpoint, so `repo view` live coverage runs when one of the
supported token environment variables is set.
