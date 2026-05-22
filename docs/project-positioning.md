# Project Positioning

## Decision

This project is primarily a `gh`-compatible, scriptable, agent-ready GitCode CLI.
Its job is to make common GitCode work predictable from terminals, scripts, CI,
and AI agents: stable JSON fields, compact human output, low-surprise mutation
commands, and command names that feel familiar to GitHub CLI users where GitCode
has a matching concept.

## Comparison With `toads/gitcode-cli`

`toads/gitcode-cli` demonstrates broad native GitCode CLI coverage and is a
useful reference for GitCode-specific product vocabulary. This project should
not frame itself as a clone. The differentiator is a narrower automation-first
contract: gh-like commands for the common repository, issue, pull request, file,
auth, search, and release loops; explicit compatibility documentation; and
agent guidance packaged with the repo.

## web2cli

The `web2cli` harness stays in this package for now as a secondary capability.
It remains useful for generating agent-friendly CLIs from web apps, but it is
not the README's primary product story. If the GitCode command surface and the
web harness begin to require separate release cadences, the harness should move
to its own package.

## Source Of Truth

Follow-up implementation issues should use this decision, the README, and
`docs/gh-compatibility-matrix.md` as the source of truth for scope. New commands
should prefer stable JSON output, mockable tests, and explicit docs over broad
surface area.
