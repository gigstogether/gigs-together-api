# Alerting

This document describes the internal application alerts that require administrator attention.

## Architecture

Feature modules own their alert definitions and decide when an alert should be reported. `AlertingModule` owns only the provider-neutral reporting and delivery mechanics:

```text
feature-owned alert definition
  -> AlertingService structured error log
  -> best-effort delivery
  -> Telegram alerts channel
```

`AlertingModule` must not import or maintain a registry of its consumers. Alert codes are opaque camelCase strings defined next to the condition that produces them.

`AlertingService.reportFailureBestEffort` always records the reported failure with the alert code, alert severity, safe attributes, and feature context. Alert severity controls delivery urgency and presentation; the application log level and stack-trace policy are configured independently for each reported failure. A delivery failure produces an additional error log and does not replace the original application result.

The initial delivery adapter sends alerts to the Telegram channel configured by `ALERTS_TELEGRAM_CHANNEL_ID`.

## Failure propagation and logging ownership

Each reported application failure must produce one structured application log. The feature that owns the failed operation is the logging owner:

```text
provider or client failure
  -> typed boundary error with preserved cause and safe diagnostics
  -> feature-owned AlertingService.reportFailureBestEffort call
  -> one structured application log
  -> best-effort alert delivery
```

A provider, client, repository, or adapter must not log a failure when it will propagate that same failure to an outer alert owner. Logging at both levels creates duplicate records, while replacing the upstream failure with a generic `Error` removes the information needed to diagnose it.

When translating an upstream failure, the boundary must:

- use a typed error owned by the boundary;
- preserve the original failure as a native or otherwise non-enumerable `cause`;
- provide an actionable message rather than only `Operation failed`;
- expose only explicitly selected safe fields such as `providerOperation`, `status`, `code`, or a sanitized `hint`;
- exclude tokens, credentials, authorization headers, raw upstream payloads, configuration values, and signed URL query parameters.

The feature owner catches the typed error, maps its safe fields into alert attributes, and calls `AlertingService.reportFailureBestEffort` once. `AlertingModule` remains provider-neutral and does not inspect provider-specific error classes.

Lower-level logging is appropriate only when that layer fully contains the failure and does not propagate or report it elsewhere. Expected external-service failures with sufficient structured diagnostics normally omit stack traces; unexpected programming or orchestration failures normally include them.

## Active alerts

### `googleCalendarConfigurationInvalid`

- **Owner:** `GoogleCalendarProvider`
- **Severity:** `warning`
- **Log level:** `error`, without stack trace
- **Condition:** Google Calendar cannot be initialized because `CALENDAR_ID` is absent or the service-account credentials configuration is invalid.
- **Attributes:** `operation`, `configurationIssue`
- **Application behavior:** application startup continues without a usable Calendar integration; alert logging and delivery are best-effort.
- **Deduplication:** none; configuration is evaluated once per application startup.

### `googleCalendarConnectionCheckFailed`

- **Owner:** `GoogleCalendarProvider`
- **Severity:** `warning`
- **Log level:** `error`, without stack trace
- **Condition:** the configured credentials cannot access the target Google Calendar during the application bootstrap connection check.
- **Attributes:** `operation`, and the available safe Google API metadata: `status`, `code`, `hint`
- **Application behavior:** application startup continues; alert logging and delivery are best-effort.
- **Deduplication:** none; the connection check runs once per application startup.

### `gigCalendarEventCreationFailed`

- **Owner:** `GigCandidateApprovalService`
- **Severity:** `warning`
- **Log level:** `error`, without stack trace
- **Condition:** Calendar event creation fails after a GigCandidate has already been approved and converted into a Gig.
- **Attributes:** `operation`, `trigger`, `gigCandidateId`, `gigId`, `gigPublicId`, and safe provider diagnostics when available: `calendarProvider`, `providerOperation`, `status`, `code`, `hint`
- **Application behavior:** approval remains successful; alert logging and delivery are best-effort.
- **Deduplication:** none.

### `translationEntryMissing`

- **Owner:** `TranslationCacheService`
- **Severity:** `warning`
- **Log level:** `error`, without stack trace
- **Condition:** runtime code requests a translation entry that is absent from the active cache.
- **Attributes:** `operation`, `namespace`, `key`, `locale`
- **Application behavior:** the original `MissingTranslationError` is still thrown; alert logging and delivery run asynchronously on a best-effort basis.
- **Deduplication:** one alert for each normalized `namespace + key + locale` combination per cache version. A successful full cache revalidation resets all fingerprints. A successful namespace revalidation resets only that namespace. Failed revalidation preserves the fingerprints.

### `translationDocumentInvalid`

- **Owner:** `TranslationCacheService`
- **Severity:** `warning`
- **Log level:** `error`, without stack trace
- **Condition:** an active translation document fails validation and is skipped while loading the runtime cache.
- **Attributes:** `operation`, `documentId`, `namespace`, `key`, `locale`, `invalidFields`
- **Application behavior:** valid translation documents continue loading; alert logging and delivery are best-effort.
- **Deduplication:** none; an invalid document is reported during every full or matching namespace cache load.

### `weeklyDigestPostFailed`

- **Owner:** `DigestCronService`
- **Severity:** `warning`
- **Log level:** `error`; expected digest delivery errors omit the stack, while unexpected errors include it
- **Condition:** an unattended scheduled weekly digest or startup catch-up run fails while checking eligibility, loading Gigs, or creating the Telegram post.
- **Attributes:** `operation`, `trigger`, `cronExpression`, `timeZone`, and safe provider-neutral delivery diagnostics when available: `deliveryProvider`, `providerOperation`, `status`, `code`, `providerErrorCode`, `providerDescription`, `providerFailureCode`, `failedItemPosition`, `gigPublicId`, `mediaUrl`
- **Application behavior:** scheduled failures are reported and rethrown; startup catch-up failures are reported and contained so application startup can continue.
- **Deduplication:** none.
- **Scope:** manual digest requests through the admin API are not included because their errors are returned directly to the caller.

## Adding an alert

1. Define the stable code, severity, and summary in the feature that owns the reported condition using `satisfies AlertDefinition`.
2. Build safe structured attributes in that feature. Do not include secrets, tokens, raw configuration values, or sensitive payloads.
3. If the failure crosses a provider or client boundary, translate it into a typed error with a preserved cause and safe structured diagnostics without logging it at that boundary.
4. Call `AlertingService.reportFailureBestEffort` once from the feature owner with the ready alert, translated or original error, log context, and actionable log note.
5. Decide explicitly whether the originating operation should continue or rethrow after reporting.
6. Add success and failure-path tests, including deduplication tests when the feature suppresses repeated alerts and regression coverage that prevents duplicate lower-level logging.
7. Add the new code to the active alert catalog in this document.

Do not add consumer-specific codes, definitions, formatting, or deduplication rules to `AlertingModule`.
