# Changelog

All notable changes to this package are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-10-28

### Changed

- `ads.features()` waits while the API is still analysing an ad's media: a new video analysis now
  answers 202 with `meta.status` = `processing` and `retry_after` (free), and the SDK asks again
  until the data is ready, for up to 2 minutes. `{ wait: false }` returns the first answer as it is,
  `maxWaitMs` changes the limit.
- `AdFeaturesResponse`: `data` is null while processing; `meta.status` (`ready` | `processing`)
  and `meta.retry_after` are new, `meta.analyzed_at` is optional.
- The features docs no longer describe how the features are computed.

## [0.3.0] - 2026-10-28

### Added

- CSV output (`output=csv`): `adlib.requestCsv(req)` for any `/v1` endpoint, plus `searchCsv`
  (`adlib.searchCsv` and `ads.searchCsv`), `advertisers.adsCsv`, `advertisers.changesCsv`,
  `advertisers.timelineCsv` and `domains.checkCsv`. They return `{ csv, nextCursor }` (`CsvPage`),
  with the cursor of the next page from the `X-Next-Cursor` header.
- README: credits per ad for all twelve platforms (1 on Meta, TikTok, Pinterest, X, Snapchat,
  Apple, Amazon and Microsoft; 2 on Google, YouTube and Play; 3 on LinkedIn), the 2-credit features
  price, the free endpoints, and Slack and Discord webhook URLs on watchlists.

### Changed

- Ad and advertiser ids are checked against the ten platform prefixes (`meta`, `google`, `tiktok`,
  `linkedin`, `pinterest`, `x`, `snapchat`, `apple`, `amazon`, `microsoft`) before a request is
  sent; YouTube and Play ads have `google:` ids.

### Fixed

- The `advertisers.reportMatch` validation message lists `wrong_role` as a kind.

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
