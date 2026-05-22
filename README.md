# gitcode-cli

This repository contains a TypeScript CLI-Anything-inspired harness for turning
web applications into agent-friendly command line tools.

The first tool is `cli-anything-web2cli`:

```bash
npm install
npm run build
npm link
cli-anything-web2cli analyze ./my-web-app -o web2cli-spec.json
cli-anything-web2cli design web2cli-spec.json -o WEB2CLI.md
cli-anything-web2cli scaffold web2cli-spec.json -o generated-web-cli
```

It accepts either a local web project directory or an HTTP(S) URL. The analyzer
extracts routes, API endpoint hints, HTML forms, package scripts, framework
signals, and OpenAPI files. The scaffolder turns that spec into a small Node CLI
package with JSON output, request helpers, form inventory, endpoint
inventory, and an interactive REPL.
