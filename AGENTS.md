# AGENTS

This file contains repository-wide guidance for AI coding agents and human contributors.

## Scope

Apply these rules to the whole repository unless a more specific instruction exists closer to the relevant files.

## Code Style

- Prefer explicit, strict typing. Keep types narrow and avoid widening to `string | number | ...` when the domain is known.
- Comments must be in English using the Latin alphabet only. Do not write comments in Cyrillic.
- For numeric constants in seconds or milliseconds (for example `604_800`, `86_400`), add a short comment with human-readable equivalents (at least days or hours, and minutes when useful).
- Boolean variables and flags should preferably start with `is`/`has`/`can`, for example `isActive`, `isAdmin`, `isValid`.
- Always create new files with `LF` line endings (not `CRLF`). Prefer editor or Git settings that default new files to `LF`.
- Keep line endings as `LF` in tracked files. If you hit formatter errors caused by `CRLF`, convert the file to `LF` and reformat.

## Execution Rules

- Do not run `build`, `dev`, or start watchers or servers unless the user explicitly asks.
- If command execution is needed to validate a change, ask first instead of running it proactively.
- After source code changes (`*.ts`, `*.js`, `*.json`), run `npm run lint:fix` before finishing the task without asking the user.
- If necessary for the task, it's allowed to run relevant tests without asking the user.
- Do not run lint after documentation-only changes (for example `*.md`).

## Secrets Access Policy

- Never read or print repository secret files such as `.env`, `.env.*` (except `.env.example`), private keys, or credential dumps.
- Treat `.env` and `.env.*` (except `.env.example`) as denied by default for AI agents. Do not run commands like `cat`, `type`, `Get-Content`, `rg`, or editors against them.
- Use `.env.example` (or documented variable names) for configuration guidance instead of reading real secret files.
- If a task cannot be completed without secret values, stop and ask the user to provide only the required variable names or masked values.

## Testing Rules

- Use Vitest for unit and integration tests in this repository.
- Write tests for all new code.
- Name test files as `*.test.*`. Colocate them near the module under test when practical.
- Name `describe` blocks after the unit under test (module/function/behavior group), for example `describe('fetchApiJson')`.
- Keep `describe` names short and stable; do not duplicate scenario phrasing that belongs in `it`.
- `describe` naming format: prefer exact symbol/module names (`fetchApiJson`, `useCalendarAvailableDates`, `parseCountries`), not full sentence descriptions.
- Write test titles in clear behavior form: `should <expected behavior> when <condition>`.
- Use Arrange-Act-Assert structure in each test; keep one primary behavior assertion per test.
- Do not add explicit AAA comments like `// Arrange`, `// Act`, `// Assert`; keep AAA structure through code layout only.
- Prefer deterministic tests: no real network, no timers without control, no hidden global state dependencies.
- Mock only at I/O boundaries (HTTP, storage, time, env). Do not mock pure business logic modules.
- For bug fixes, add at least one regression test that fails before the fix and passes after it.
- Cover both success and failure paths for boundary parsers, guards, and request flows.
- Keep fixtures minimal and explicit; avoid oversized shared fixtures that hide intent.
- Use `beforeEach`/`afterEach` to fully reset mocks, stubs, and globals.
- Do not assert on implementation details if externally observable behavior can be asserted instead.
- When asserting errors, verify error type and key message/code fields, not only "throws".
- Keep tests fast and isolated so they can run in parallel reliably.
- Avoid snapshot tests for dynamic or business-critical payloads; prefer explicit field assertions.

## TypeScript Rules

- `any` is forbidden by default.
- Use `unknown` plus type guards or narrowing instead of `any`.
- If you need a flexible object shape, prefer `Record<string, unknown>` or a specific interface over `any`.
- If you need to type JSON, prefer `unknown` or an explicit JSON union over `any`.
- Use `any` only when there is no realistic alternative, for example a truly untyped third-party API surface.
- When using `any`, localize it at the boundary and add a short comment explaining why it is unavoidable.

- Mark a function as `async` only when it contains `await`.
- If a function returns a `Promise` without using `await`, declare the `Promise` return type explicitly in the signature instead of marking the function as `async`.
- Do not use `.then(...)` when the same logic can be written with `await`.

- Avoid type assertions with `as` as much as possible.
- Prefer type guards, narrowing, and better source types instead of `as`.
- Prefer `satisfies` for validating object shapes without changing inferred types.
- Prefer parsing and validation at boundaries such as HTTP, env, storage, and third-party SDKs so the rest of the code stays strongly typed.
- Avoid `as any` entirely.

- Prefer `readonly` where immutability is appropriate, especially for DTOs, config objects, and constants.

- Prefer named types for public APIs such as service methods, controller responses, and module exports.
- Do not use inline object types in public signatures such as `Promise<{ ... }>` or `foo(arg: { ... })`.
- Extract object shapes into a named `interface` or `type`, ideally colocated in `types/requests/*` for DTOs.
- Prefer a named params object for long function signatures.
- When an object-parameter function signature becomes long, do not destructure in the parameter list; accept `params: SomeParams` and destructure inside the function body.

- Prefer `interface` over `type` for object shapes unless `type` is clearly the better fit.
- Use `type` for unions, intersections, mapped types, conditional types, tuples, and other patterns that interfaces cannot express cleanly.
- Keep type imports separate from value imports. Do not mix them in one import statement.

## Strictness

- Prefer explicit correctness over best-effort fallbacks.
- Do not add "just in case" logic that guesses shapes or silently recovers from invalid states.
- If something is not as expected, throw an error or return an explicit error result instead of defaulting silently.
- Avoid patterns that hide invalid states, for example `res?.data ?? res ?? {}`, `value || {}`, or `arr ?? []` when the default is not explicitly part of the contract.
- At boundaries, parse unknown input, validate the expected shape, and throw if it does not match.

## Architecture and Design Decisions

- This is a **production** project with real users, not an MVP playground. Treat new and changed code accordingly.
- When introducing or changing behavior, **design for the best fit for this codebase first**: established patterns, clear ownership, maintainability, and correctness over speed of delivery or size of diff.
- Do **not** default to quick-and-dirty, "good enough for now", or compromise solutions when a clearly better alternative exists for this project.
- Do **not** recommend the smallest refactor, the fastest patch, or the simplest workaround **instead of** the more correct design unless the user explicitly asks for that tradeoff.
- **Do** research and propose best practices, proven patterns, and the most appropriate architecture for the task before implementation.
- **Do** propose refactoring when the current structure blocks the correct solution or would accumulate avoidable technical debt.
- Inferior or shortcut options may be listed **only after** presenting the preferred approach, **or** when the user explicitly requests alternatives. Always label them as not the best/default choice and explain why (tradeoffs, debt, limits).
- Perfection everywhere is not required, but **initial decisions should aim at the right long-term shape**; shortcuts must be conscious and explicit, not silent defaults.

## Legacy and backward compatibility

- Do not keep legacy code, aliases, fallbacks, or compatibility shims without a clear reason.
- If code remains **only** for backward compatibility, document that explicitly on the symbol: JSDoc on the function, method, class, type, or exported constant (what it supports, what callers should use instead, and when it can be removed if known).
- Prefer removing unused legacy paths over leaving them “just in case”. If retention is intentional, the doc must say **legacy** or **backward compatibility** and the reason — not an unexplained special case in implementation.
- Read-time normalization for old stored data (for example mapping missing fields to a default) belongs at the **I/O boundary** and must be documented as legacy compatibility, with a path toward explicit data or stricter validation.

## NestJS Patterns

- **Version HTTP endpoints by default** using Nest `@Version(...)` (for example `@Version('1')` → `/v1/...`). Exceptions are rare and must be justified (health checks, webhooks with a fixed external URL, static assets, or similar). When adding an unversioned route, note why in the controller or module doc.
- Prefer DTOs for request and response shapes.
- Keep controllers thin and move business logic into services.
- Use dependency injection consistently.
- Avoid creating clients directly inside methods unless the scope requires it and the reason is clear.
- For successful requests with **no response body**, return only the appropriate HTTP status code (for example `204 No Content` via `@HttpCode(HttpStatus.NO_CONTENT)` and `Promise<void>`). Do not return placeholder JSON such as `{ ok: true }` or `{ success: true }`.
- When the endpoint has a meaningful response payload (for example health checks with service metadata), return that payload explicitly; the empty-body rule applies only when there is nothing useful to return.

## File placement

- Do not add a new file when the code has a **single call site** — colocate it in the existing module artifact (service, controller, guard, pipe, mapper, or parser) instead.
- Extract to a shared file only when there are **multiple consumers**, or when the boundary is already established (request/response DTOs under `types/requests/*`, guards and validators reused across controllers, module public exports, shared parsers at HTTP or I/O boundaries).
- Prefer extending an existing file in the same feature module over creating parallel one-off helpers.

## Translations

- Do not use the word **copy** for UI text, labels, strings, templates, or other translatable content. Prefer **text**, **strings**, **labels**, or **content**. Reserve **copy** for clipboard actions (for example `Copy link`) and file operations (for example `Copy .env.example`).
- Translation **namespaces** and **keys** use **camelCase** identifiers.
- Namespace pattern: start with a lowercase letter, then alphanumeric; examples: `common`, `telegram`, `default`.
- Key pattern: dot-separated camelCase segments; examples: `mainGig.withLink`, `weeklyDigest.gigLine.html`, `button.approve`.
- Do not use snake_case or kebab-case in namespaces or keys (for example `main_gig_post`, `weekly-digest`).
- Post template keys name the post type without a redundant `Post` suffix (for example `mainGig`, `weeklyDigest`, not `mainGigPost`); namespace `telegram` already scopes channel post text.
- **Locale** values stay lowercase ISO 639-1 codes (for example `en`, `es`); locale is not camelCase.
- Preserve namespace casing in storage and API responses; do not normalize namespaces to lowercase.
- Reuse validation helpers in `src/modules/translation/translation-identifiers.ts` when parsing or validating translation records, seeds, and admin input.
- Translation record shape: `namespace`, `key`, `value`, `format` (`plain`), `kind` (`text` for labels and static strings, `template` for strings with `{placeholders}`), `isActive`.

## Notes

- This file is the repository-wide, tool-agnostic source of agent instructions.
- If a tool supports its own instruction format, prefer pointing it to this file instead of duplicating rules.
