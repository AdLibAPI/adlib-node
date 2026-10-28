# Changelog

All notable changes to this package are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-28

### Added

- Platforms `snapchat`, `apple`, `amazon` and `microsoft` (beta) in `Platform` and `PLATFORMS`;
  `youtube` and `play` as search aliases for Google, and the `placement` search filter (`youtube`,
  `search`, `shopping`, `maps`, `play`).
- `ads.features(id)` for `GET /v1/ads/{id}/features`: creative features (hook, offers, urgency,
  social proof, format, video length, cuts, on-image text), with `AdFeatures` types.
- `adlib.libraryUrl(url)` for `GET /v1/library-url`: turns an ad library link into an AdLib id.
- `adlib.coverage()` for `GET /public/coverage` and `domains.suggest(q)` for `GET /v1/domains/suggest`.
- `watchlists.update(id, { name, webhookUrl, emailAlerts })` for `PATCH /v1/watchlists/{id}`, and
  `emailAlerts` on `watchlists.create`; `Watchlist.email_alerts`.
- `removed` search filter (source history only), `Ad.removed_from_library_at`, the `removed` event
  type in changes, and `removed` in `advertiser.changes` webhook events.
- `derived.signals` and `derived.stage` on ads, `meta.platform_totals` on lists, `columns` on domain
  checks, `reach` on ad history, `family` on companies and `Plan.min_interval_hours`.
- `companies.get(domain | params)` for `GET /v1/companies/{domain}`: all ad accounts of a domain
  across platforms with combined stats, plus candidates below `minScore`.
- `advertisers.reportMatch(...)` and `advertisers.listReports()` for
  `/v1/advertisers/resolve/reports`.
- `political` search filter, `Ad.political` and `AdvertiserStats.political_ads`.
- `role` and `role_source` on resolved advertisers, `Company.related`, `includeRelated` on
  `companies.get`, and `kind: "wrong_role"` with `role` on `advertisers.reportMatch`.
- `match_reason: "manual"` on resolved advertisers, `Plan.history_days`, and the `history_limit`
  error code (403, `PermissionDeniedError`).

### Changed

- PATCH requests are retried like GET and DELETE.
- `Watchlist.interval_seconds` is now `interval_hours`; watchlists also have `advertiser_count`.
  `watchlists.list()` returns them without `advertisers` entries; use `watchlists.get(id)`.

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
