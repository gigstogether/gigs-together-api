---
name: pr
description: Create or reuse GitHub pull requests for the Gigs Together backend and frontend according to the repository's shared pull request rules, then return their web URLs. Use when the user asks to open a PR in either or both repositories. Invoke as $pr or select PR through /skills.
---

# Create Gigs Pull Request

1. Read [PULL_REQUEST_RULES.md](../../../PULL_REQUEST_RULES.md) completely and follow it as the authoritative workflow policy.
2. Read the applicable `AGENTS.md` in every repository included in the request.
3. Apply repository, branch, and other options supplied by the user; otherwise use the defaults from the shared rules.
4. Inspect the relevant remote diffs and create or reuse the required pull requests through GitHub CLI or the available GitHub integration.
5. Verify and return the canonical web URL for every pull request, together with any warnings or blockers required by the shared rules.

Do not report successful creation without a verified pull request URL.
