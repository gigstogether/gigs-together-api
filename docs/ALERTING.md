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

`AlertingService.reportFailureBestEffort` always records the original failure with the alert code, severity, safe attributes, feature context, and stack trace when available. Warning alerts use the `warn` log level, while critical alerts use `error`. A delivery failure produces an additional error log and does not replace the original application result.

The initial delivery adapter sends alerts to the Telegram channel configured by `ALERTS_TELEGRAM_CHANNEL_ID`.

## Active alerts

### `gigCalendarEventCreationFailed`

- **Owner:** `GigCandidateApprovalService`
- **Severity:** `warning`
- **Condition:** Calendar event creation fails after a GigCandidate has already been approved and converted into a Gig.
- **Attributes:** `operation`, `gigCandidateId`, `gigId`, `gigPublicId`
- **Application behavior:** approval remains successful; alert logging and delivery are best-effort.
- **Deduplication:** none.

### `translationEntryMissing`

- **Owner:** `TranslationCacheService`
- **Severity:** `warning`
- **Condition:** runtime code requests a translation entry that is absent from the active cache.
- **Attributes:** `operation`, `namespace`, `key`, `locale`
- **Application behavior:** the original `MissingTranslationError` is still thrown; alert logging and delivery run asynchronously on a best-effort basis.
- **Deduplication:** one alert for each normalized `namespace + key + locale` combination per cache version. A successful full cache revalidation resets all fingerprints. A successful namespace revalidation resets only that namespace. Failed revalidation preserves the fingerprints.

### `weeklyDigestPostFailed`

- **Owner:** `DigestCronService`
- **Severity:** `warning`
- **Condition:** an unattended scheduled weekly digest or startup catch-up run fails while checking eligibility, loading Gigs, or creating the Telegram post.
- **Attributes:** `operation`, `trigger`, `cronExpression`, `timeZone`
- **Application behavior:** scheduled failures are reported and rethrown; startup catch-up failures are reported and contained so application startup can continue.
- **Deduplication:** none.
- **Scope:** manual digest requests through the admin API are not included because their errors are returned directly to the caller.

## Adding an alert

1. Define the stable code, severity, and summary in the feature that owns the reported condition using `satisfies AlertDefinition`.
2. Build safe structured attributes in that feature. Do not include secrets, tokens, raw configuration values, or sensitive payloads.
3. Call `AlertingService.reportFailureBestEffort` with the ready alert, original error, log context, and actionable log note.
4. Decide explicitly whether the originating operation should continue or rethrow after reporting.
5. Add success and failure-path tests, including deduplication tests when the feature suppresses repeated alerts.
6. Add the new code to the active alert catalog in this document.

Do not add consumer-specific codes, definitions, formatting, or deduplication rules to `AlertingModule`.
