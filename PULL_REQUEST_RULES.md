# Pull Request Rules

These rules apply when creating pull requests for the Gigs Together frontend and backend repositories.

## Repository selection and branches

- The backend repository is this repository (`gigs-together-api`).
- The frontend repository is the sibling repository `../gigs-together-front`.
- Unless the user says otherwise, use `dev` as the source branch and `main` as the target branch.
- If the user provides source or target branches, use those branches for the selected repositories. The user may provide different branch pairs for backend and frontend; for example, backend `api-feature` into `main` and frontend `dev` into `main`.
- Unless the user selects a repository explicitly, inspect both repositories and create a pull request only in each repository that has a remote change between the selected branches.
- If the user explicitly selects frontend, backend, or both, limit the operation to that selection.
- Compare fetched remote refs, not the working tree or local-only commits. Do not create a pull request when the remote source branch has no effective change relative to the remote target branch.

## Local changes and remote state

- Fetch the relevant remote refs before analyzing the change. Fetching may update Git metadata such as remote-tracking refs and `FETCH_HEAD`, but it must not modify the working tree, index, local branches, or local commits.
- Never stage, commit, stash, discard, or push uncommitted changes as part of this workflow.
- Never push local-only commits as part of this workflow. Create pull requests only from branches that already exist on the remote.
- If uncommitted changes exist, leave them untouched and make it clear that they are not included in the pull request. Likewise, local commits that have not been pushed are not included in the remote diff or pull request.
- If a required remote branch does not exist or the remote state cannot be verified, stop for that repository and report the exact problem instead of guessing.

## Title and description

- Write the pull request title and description strictly in English.
- Format the title according to Conventional Commits 1.0.0: `type(optional-scope)!: concise description`.
- Choose the type and optional scope from the actual change. Use `!` when the pull request introduces a breaking change.
- Describe only behavior, code, configuration, or contracts that actually changed. Do not list unchanged behavior or add generic filler.
- Keep `Summary` to a short overview of the pull request's purpose and reviewer-visible outcome. Do not enumerate individual modifications there.
- Include a `Changes` section that lists the concrete changes in concise bullets.
- Explicitly describe every breaking change, its impact, and the required migration path.
- Explicitly describe configuration changes and any action required before or after merge, such as updating environment variables, changing external configuration, or running a migration.
- Do not state that tests, TypeScript checks, linters, builds, or other automated checks were run. Do not add a test-results or automated-checks section.
- Include a concise `Verification` section that tells a reviewer what change-specific behavior to test manually or functionally.
- Omit optional sections that do not apply. Do not add statements such as "No breaking changes" or "No configuration changes."

Use this body shape. `Summary`, `Changes`, and `Verification` are required; keep the other sections only when they apply:

```markdown
## Summary

<short overview of the pull request's purpose and outcome>

## Changes

- <concrete change>

## Dependencies

- <merge relationship, required order, and dependent pull request link>

## Breaking changes

- <impact and migration path>

## Required actions

- <action required before or after merge>

## Verification

- <change-specific behavior to verify>
```

## Cross-repository dependencies

- When frontend and backend pull requests depend on each other and must be merged together, say so explicitly in both descriptions.
- Link each pull request to the other and state any required merge or deployment order.
- When the other pull request does not have a URL yet, use the exact placeholder `<DEPENDENT_PR_URL_PENDING>`. Replace it after the dependent pull request is created whenever possible.
- If only one dependent pull request can be created, keep the placeholder and tell the user where it remains.

## Conflicts and creation behavior

- Check mergeability without merging, rebasing, changing branches, or modifying the working tree.
- Create the pull request even when conflicts exist. Do not add conflict information to the pull request title or description; report it only to the user after creation.
- Never resolve conflicts unless the user separately asks for that work.
- Before creating a pull request, check for an existing open pull request with the same repository, source branch, and target branch. Return the existing URL instead of creating a duplicate.
- Create a ready-for-review pull request unless the user explicitly asks for a draft.
- After creation, verify the pull request URL and mergeability state. Return a clickable web URL for every created or existing pull request.
