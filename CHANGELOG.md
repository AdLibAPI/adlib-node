# Changelog

All notable changes to this package are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-26

### Added

- `AdLib` client for every public `/v1` endpoint of the AdLib API: search, ads and ad history,
  advertisers (resolve, get, ads, changes, stats, timeline), domain checks, batch jobs, watchlists,
  webhook deliveries, test events and signing secret, usage, status and platforms.
- Types for every request and response.
- Typed errors from the API's `{"error":{code,message,request_id,billed}}` shape, including
  `QuotaExceededError` for `quota_exceeded`.
- Retries with exponential backoff for 429 `rate_limited` (honouring `Retry-After`) and, on GET and
  DELETE, for 502, 503, 504, timeouts and network errors.
- `paginate` and `paginateItems` following `next_cursor`.
- `verifyWebhookSignature`, `constructWebhookEvent` and `signWebhookPayload` for
  `X-AdLib-Signature`.
- `onResponse` hook with `X-Billing-Credits`, `X-Request-Id` and rate-limit headers.
