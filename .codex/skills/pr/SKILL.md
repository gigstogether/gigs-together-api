---
name: pr
description: Create or reuse GitHub pull requests for the Gigs Together backend and frontend according to the repository's shared pull request rules, then return their web URLs. Use when the user asks to open a PR in either or both repositories. Invoke as $pr or select PR through /skills.
---

# Create Gigs Pull Request

## GitHub access channel

- Use only GitHub CLI (`gh`) or the connected GitHub connector for remote inspection, authentication checks, pull request creation or reuse, updates, and verification.
- Never use a browser, Computer Use, or the GitHub web UI for any part of this workflow, including fallback authentication or recovery.
- Use whichever allowed channel is already available and authorized for pull-request writes.
- Do not prefer one channel unconditionally. If both are available, use the connector in managed Codex environments and GitHub CLI otherwise.
- Switch channels only after observing a concrete failure.
- Tell the user which channel created or reused each pull request. If both channels were attempted, also state why the fallback was necessary.
- If neither channel works, stop without using a browser. Report the CLI and connector blockers separately using the observed errors, explain whether each failure is caused by authentication, GitHub authorization, network access, sandbox permissions, missing tooling, or repository access, and offer the relevant next actions:
  - For CLI failures, suggest checking `gh auth status -h github.com` and `gh api user --jq .login`, then correcting the reported network or sandbox restriction. Never request a token or device-login code, recommend `--insecure-storage`, or authenticate on the user's behalf.
  - For connector failures, suggest connecting or reconnecting GitHub and granting access to the target repository plus pull-request write permission.
  - Ask the user to retry the skill after the applicable access issue is resolved.

1. Read [PULL_REQUEST_RULES.md](../../../PULL_REQUEST_RULES.md) completely and follow it as the authoritative workflow policy. Resolve this link relative to this `SKILL.md`; it points to `PULL_REQUEST_RULES.md` in the repository root. When the shell is already in the repository root, read `PULL_REQUEST_RULES.md` directly without prepending `..`.
2. Read the applicable `AGENTS.md` in every repository included in the request.
3. Apply repository, branch, and other options supplied by the user; otherwise use the defaults from the shared rules.
4. Inspect the relevant remote diffs and create or reuse the required pull requests through an allowed GitHub access channel.
5. Verify and return the canonical web URL for every pull request, together with any warnings or blockers required by the shared rules.

Do not report successful creation without a verified pull request URL.
