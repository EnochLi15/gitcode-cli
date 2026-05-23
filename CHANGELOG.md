# Changelog

This project follows a simple "Unreleased first" changelog. Future releases
should move completed bullets under a version heading with the release date.

## Unreleased

## 1.0.1

- Added `gc pr review --help` documentation for review-specific body and
  state flags.
- Made `gc pr review` fail locally with an actionable message when neither
  `--body` nor `--body-file` is supplied, instead of sending an empty body to
  the GitCode API.

## 1.0.0

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
- Added `gc skill status` and `gc skill install` to help users install the
  companion agent skill after installing the CLI.
- Extracted completion command handling into a command module to establish the
  incremental command-module pattern.
- Hardened live GitCode API behavior for form-encoded writes, PR review
  fallback comments, merge branch cleanup, organization listing fallback, and
  guarded release deletion through `--cleanup-tag`.

## 0.1.0

- Initial TypeScript CLI package with GitCode repo, issue, pull request, label,
  release, search, browse, config, alias, completion, and low-level API
  commands.
- Included the `cli-anything-web2cli` analyzer, design renderer, and scaffold
  generator.
