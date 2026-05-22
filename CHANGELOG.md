# Changelog

This project follows a simple "Unreleased first" changelog. Future releases
should move completed bullets under a version heading with the release date.

## Unreleased

- Clarified the project positioning as an automation-first, agent-ready GitCode
  CLI with `gh`-like workflows where GitCode has equivalent concepts.
- Added validated interactive `gc auth login` while preserving
  `gc auth login --with-token`.
- Added zh/en human error messages for common auth, permission, repository,
  validation, rate-limit, and network failures while keeping JSON errors stable.
- Added `gc file list` and `gc file view` for repository content browsing.
- Added `gc org` and `gc ssh-key` command groups for common account
  administration workflows.
- Added `gc workflow init`, `gc workflow push`, and `gc workflow diff` helpers.
- Added product-grade help examples for core GitCode commands.
- Added a `gh` compatibility matrix and first-class `skills/gitcode-cli`
  guidance for agents.
- Extracted completion command handling into a command module to establish the
  incremental command-module pattern.

## 0.1.0

- Initial TypeScript CLI package with GitCode repo, issue, pull request, label,
  release, search, browse, config, alias, completion, and low-level API
  commands.
- Included the `cli-anything-web2cli` analyzer, design renderer, and scaffold
  generator.
