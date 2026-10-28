<p align="center">
  <a href="https://adlibapi.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://adlibapi.com/brand/wordmark-dark.png">
      <img alt="AdLib" src="https://adlibapi.com/brand/wordmark.png" width="260">
    </picture>
  </a>
</p>

# adlib-api – Ad library API client for Node.js and TypeScript

[![npm](https://img.shields.io/npm/v/adlib-api.svg)](https://www.npmjs.com/package/adlib-api)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Official Node.js and TypeScript SDK for the **AdLib API**, one REST API for the public ad libraries of
**Meta (Facebook/Instagram), Google (incl. YouTube and Google Play), TikTok, LinkedIn, Pinterest, X,
Snapchat, Apple, Amazon and Microsoft** (Microsoft in beta). Find a brand's advertiser accounts on
every platform from its domain, search and read ads, see how long they ran and what changed, break a
creative down into its features, and set up watchlists that report new, stopped, changed and removed
ads to your webhook or by email.

Ads that disappear from a platform's library stay in the AdLib archive, with their run time,
creative versions and permanently archived images, and are marked with `removed_from_library_at`.

> **Get an API key:** [adlibapi.com](https://adlibapi.com) (the free plan includes 5,000 credits a month) · Docs: [api.adlibapi.com/docs](https://api.adlibapi.com/docs)

**SDKs and integrations:** [Python](https://github.com/AdLibAPI/adlib-python) · [MCP server](https://www.npmjs.com/package/adlib-mcp)

- No runtime dependencies. Uses the built-in `fetch` (Node 18+).
- ESM and CommonJS, with type declarations for every request and response.
- Retries with backoff, timeouts, `AbortSignal` support and typed errors.
- Cursor pagination helpers and webhook signature verification.

## Install

```sh
npm install adlib-api
```

## Quickstart

```ts
import { AdLib } from "adlib-api";

const adlib = new AdLib({ apiKey: process.env.ADLIB_API_KEY });

// 1. A brand's advertiser accounts on all platforms, from its domain
const { data } = await adlib.advertisers.resolve({ domain: "nike.com" });
for (const a of data.advertisers ?? []) {
  console.log(a.id, a.name, a.score, a.match_reason, a.active_ads);
}

// 2. Their ads (one search mode: q, advertiser or domain)
const page = await adlib.search({ advertiser: "meta:15087023444", status: "active", limit: 25 });
for (const ad of page.data ?? []) {
  console.log(ad.id, ad.status, ad.derived.days_running, ad.derived.stage, ad.creatives?.[0]?.text);
}
if (page.meta.errors?.length) console.log("platforms that failed (not billed):", page.meta.errors);

// 3. Watch them: we crawl regularly and POST new, stopped and changed ads to your webhook
const { data: watchlist } = await adlib.watchlists.create({
  name: "Competitors",
  advertisers: ["meta:15087023444", "tiktok:7012345678901234567"],
  webhookUrl: "https://your-app.example/webhooks/adlib",
  intervalHours: 24,
  emailAlerts: true, // also mail a digest of each crawl's changes
});
console.log(watchlist.id);

// 4. What makes their longest-running ad work: hook, offers, urgency, format, cuts, on-image text
const { data: features } = await adlib.ads.features("meta:1187430977361020");
console.log(features.format, features.text.hook, features.text.urgency, features.media?.[0]?.duration_s);
```

Requests go to `https://api.adlibapi.com` with the `X-API-Key` header. Ids are
`<platform>:<platform_id>` everywhere, e.g. `meta:15087023444` or `google:AR18378488041124659201`,
with one of the ten libraries as prefix (YouTube and Google Play ads have `google:` ids).

### Verify webhooks

Every delivery carries `X-AdLib-Signature: t=<unix>,v1=<hex>`, an HMAC-SHA256 of `"<t>.<raw body>"`
with your webhook secret (`adlib.webhooks.secret()`). Verify it against the **raw** body:

```ts
import express from "express";
import { constructWebhookEvent, WebhookSignatureError } from "adlib-api";

const app = express();
app.post("/webhooks/adlib", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const event = constructWebhookEvent({
      payload: req.body, // Buffer: the raw body, not parsed JSON
      signature: req.header("X-AdLib-Signature"),
      secret: process.env.ADLIB_WEBHOOK_SECRET!,
    });
    if (event.event === "advertiser.changes") {
      console.log(event.advertiser_id, event.summary); // { new, started, stopped, changed, removed }
    }
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof WebhookSignatureError) return res.sendStatus(400);
    throw err;
  }
});
```

`verifyWebhookSignature(...)` does the same check without parsing. Signatures are compared in
constant time, and timestamps more than 5 minutes off are rejected (`toleranceSeconds` to change).
`adlib.webhooks.test(url)` sends a signed `webhook.ping` to your endpoint, and
`signWebhookPayload(secret, body)` builds a header for your own tests. Events: `advertiser.changes`
(watchlists), `batch.completed` (batch jobs with `webhookUrl`) and `webhook.ping`.

### CommonJS

```js
const { AdLib } = require("adlib-api");
```

## Credits

The free plan includes **5,000 credits a month**. Calls are billed in credits per delivered result
(the `X-Billing-Credits` response header):

| Platform                                                             | Credits per ad |
| -------------------------------------------------------------------- | -------------- |
| Meta, TikTok, Pinterest, X, Snapchat, Apple, Amazon, Microsoft (beta) | 1              |
| Google, YouTube, Google Play                                         | 2              |
| LinkedIn                                                             | 3              |

Archived ads last shown more than a year ago cost double. A live search page costs at most 5 ads'
worth per platform (5 credits on Meta, 10 on Google, 15 on LinkedIn), however many ads it returns.
`ads.features(id)` costs 2 credits (plus the ad if it has to be fetched live). `libraryUrl`,
`domains.suggest`, `advertisers.reportMatch` and `advertisers.listReports` are free.
**Empty results, cached results, platform errors and API errors are free.**

`paginate` and `paginateItems` fetch at most 10 pages unless you raise `maxPages`. To see what each
call cost, pass `onResponse`:

```ts
const adlib = new AdLib({
  onResponse: (r) => console.log(r.url, r.billedCredits, r.rateLimitRemaining, r.requestId),
});
```

## Options

```ts
new AdLib({
  apiKey: "...",         // or ADLIB_API_KEY
  baseUrl: "...",        // or ADLIB_BASE_URL; default https://api.adlibapi.com (a trailing /v1 is ignored)
  timeoutMs: 120_000,    // per attempt; live searches over all platforms can take a while
  maxRetries: 2,         // see Retries
  retryDelayMs: 500,     // base delay of the exponential backoff
  fetch: customFetch,    // any fetch-compatible function
  onResponse: (info) => {}, // billing and rate-limit headers of every successful response
});
```

The constructor throws an `AuthenticationError` when no key is found. Every method also takes
request options as its last argument:

```ts
await adlib.ads.get("meta:1234567890", { signal: AbortSignal.timeout(10_000), maxRetries: 0 });
```

## Usage

### Search

```ts
await adlib.search({ q: "running shoes", platform: ["meta", "tiktok"], country: "US" });
await adlib.search({ domain: "nike.com", status: "active", format: "video" });
await adlib.search({ advertiser: "Nike", from: "2026-01-01", to: "2026-04-01" });
// Only political or issue ads (Meta labels them; false excludes them)
await adlib.search({ q: "election", political: true });
// Our archive, including ads gone from the platforms; longest-running first
await adlib.search({ advertiser: "meta:15087023444", source: "history", sort: "days_running" });
// Ads the platforms' libraries no longer show (taken down, deleted or aged out) that we kept
await adlib.search({ domain: "nike.com", source: "history", removed: true });
// YouTube video ads (youtube and play are aliases for Google with that placement)
await adlib.search({ advertiser: "Nike", platform: "youtube", format: "video" });
await adlib.search({ domain: "nike.com", platform: "google", placement: "shopping" });
// The newer platforms
await adlib.search({ q: "running shoes", platform: ["snapchat", "amazon", "microsoft"] });
```

`adlib.search` is the same as `adlib.ads.search`. Without `platform`, all platforms that support the
query are asked in parallel; failed ones are listed in `meta.errors` and not billed, and
`meta.platform_totals` holds the number of matching ads per platform where the platform reports it.
See `adlib.platforms()` for the search modes and filters each platform supports.

Platforms: `meta`, `google`, `tiktok`, `linkedin`, `pinterest`, `x`, `snapchat`, `apple`, `amazon` and
`microsoft` (beta), exported as `PLATFORMS`. In search, `youtube` and `play` are accepted too.
`placement` (Google only) is one of `youtube`, `search`, `shopping`, `maps` and `play`.

### Ads

```ts
await adlib.ads.get("meta:1234567890");                    // live, or the archived version
await adlib.ads.get({ id: "meta:1234567890", maxAge: 0 }); // always fetch live
await adlib.ads.history("meta:1234567890");                // versions, status periods, events, EU reach per day
await adlib.ads.features("meta:1234567890");               // creative features (default 2 credits)

// Got a link from an ad library? Turn it into an AdLib id (free)
const { data: ref } = await adlib.libraryUrl("https://www.facebook.com/ads/library/?id=1187430977361020");
console.log(ref.kind, ref.id, ref.href); // "ad", "meta:1187430977361020", "/v1/ads/meta:1187430977361020"
```

Every ad has `derived.signals` (why it likely performs, from public facts: `long_running`,
`still_running_90d`, `scaled`, `wide_reach`, `multi_country`) and `derived.stage` (`testing`,
`scaling` or `proven`). `removed_from_library_at` is set once the platform's library stops showing
the ad; we keep it.

`ads.features(id)` returns tags with evidence: every text tag (`urgency`,
`social_proof`, `guarantee`, `free_offer`, `free_shipping`, `novelty`) carries the exact text it
matched, media are measured (aspect, duration, scene cuts, audio) and on-image text
is read with OCR. Results are kept per ad version.

### Advertisers

```ts
await adlib.advertisers.resolve({ domain: "nike.com", platform: "meta,google", maxPerPlatform: 3 });
await adlib.advertisers.get("meta:15087023444");
await adlib.advertisers.get({ id: "meta:15087023444", refresh: true });
await adlib.advertisers.ads({ id: "meta:15087023444", source: "history", status: "inactive" });
await adlib.advertisers.changes({ id: "meta:15087023444", since: "2026-10-01", types: ["started", "stopped", "removed"] });
await adlib.advertisers.stats("meta:15087023444");   // by status/format/country/language, winners
await adlib.advertisers.timeline({ id: "meta:15087023444", from: "2026-01-01" });

// A wrong or missing resolve match? Report it (free, up to 50 per day). Accepted reports fix the
// resolve for everyone and show up as match_reason "manual".
await adlib.advertisers.reportMatch({
  domain: "nike.com",
  kind: "wrong_match", // or "missing_match" (advertiserId and role optional)
  advertiserId: "google:AR18378488041124659201",
  note: "not this brand",
});
// The account belongs to the domain but has the wrong role (advertiserId and role required)
await adlib.advertisers.reportMatch({ domain: "nike.com", kind: "wrong_role", advertiserId: "meta:42", role: "agency" });
await adlib.advertisers.listReports(); // your reports and how we resolved them
```

### Companies

```ts
// All ad accounts of a domain across platforms, with combined stats
const { data: company } = await adlib.companies.get("audi.de");
await adlib.companies.get({ domain: "audi.de", platform: ["meta", "google"], minScore: 0.75, maxPerPlatform: 5 });
console.log(company.name, company.stats.total_ads, company.platforms?.map((p) => [p.platform, p.accounts, p.active_ads]));
console.log(company.related);    // agencies, resellers and partners running ads for the domain
console.log(company.candidates); // accounts below minScore, not part of the totals
await adlib.companies.get({ domain: "audi.de", includeRelated: true }); // count related in platforms and stats
```

`accounts` holds the company's own accounts (`role` brand or unknown); every resolved advertiser has a
`role` and a `role_source` (manual or inferred). Costs one resolve plus one stats call.
`stats.advertiser_id` is the domain.

### Domains

```ts
const { data } = await adlib.domains.check("nike.com"); // is this company advertising right now, and where?
console.log(data.advertising, data.platforms?.map((p) => [p.platform, p.active_ads]));
console.log(data.columns); // flat map for spreadsheets: advertising, total_active_ads, meta_active_ads, ...
await adlib.domains.suggest("nik"); // autocomplete from domains we know (free)
```

### Batch jobs

```ts
const { data: job } = await adlib.batch.create({
  type: "domains",
  items: ["nike.com", "adidas.com"],
  options: { include_ads: true },
  webhookUrl: "https://your-app.example/webhooks/adlib", // batch.completed
});
const result = await adlib.batch.get({ jobId: job.job_id }); // status and paginated items
```

### Watchlists

```ts
await adlib.watchlists.list();    // advertiser_count per watchlist; advertisers is empty here
await adlib.watchlists.get(id);   // incl. the crawl status of each advertiser
await adlib.watchlists.update(id, { name: "Rivals", webhookUrl: "", emailAlerts: true }); // "" removes the webhook
// webhookUrl may also be a Slack or Discord incoming webhook: those get a readable message
await adlib.watchlists.update(id, { webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX" });
await adlib.watchlists.addAdvertisers(id, ["google:AR18378488041124659201"]);
await adlib.watchlists.removeAdvertiser(id, "google:AR18378488041124659201");
await adlib.watchlists.delete(id);
```

### Webhooks

```ts
await adlib.webhooks.deliveries({ status: "failed" }); // newest first, kept 30 days
await adlib.webhooks.delivery(42);                     // incl. its payload
await adlib.webhooks.redeliver(42);
await adlib.webhooks.test("https://your-app.example/webhooks/adlib");
await adlib.webhooks.secret();       // { secret: "whsec_...", version }
await adlib.webhooks.rotateSecret(); // the old secret stops working immediately
```

### Account and status

```ts
await adlib.usage({ days: 30 }); // plan, credits this month, daily rows
await adlib.status();            // health per platform (no key needed, not billed)
await adlib.platforms();         // search modes and filters per platform
await adlib.coverage();          // archive size and freshness (public)
```

### CSV

Any `/v1` endpoint answers as CSV with `output=csv`, billed the same as JSON. `data` is flattened:
one row per item, nested objects as dotted columns (`advertiser.name`), value lists joined with `|`,
of object lists only the first item (`creatives.0.text`) plus a `creatives_count` column.

```ts
const { csv, nextCursor } = await adlib.searchCsv({ domain: "nike.com", source: "history" });
await adlib.advertisers.adsCsv({ id: "meta:15087023444" });
await adlib.advertisers.changesCsv({ id: "meta:15087023444", since: "2026-10-01" });
await adlib.advertisers.timelineCsv({ id: "meta:15087023444" });
await adlib.domains.checkCsv("nike.com"); // one row with the flat columns
await adlib.requestCsv({ path: "/v1/watchlists" }); // any other endpoint
```

`nextCursor` comes from the `X-Next-Cursor` header; pass it back as `cursor`. Errors are still
thrown as typed errors.

### Endpoints not wrapped yet

```ts
const res = await adlib.request<{ data: unknown }>({ method: "GET", path: "/v1/new-endpoint", query: { a: 1 } });
```

## Pagination

List endpoints return `next_cursor`; pass it back as `cursor`, `null` means last page.

```ts
// Page by page
for await (const page of adlib.paginate(adlib.ads.search, { q: "running shoes" }, { maxPages: 3 })) {
  console.log(page.pageNumber, page.data.data?.length, page.nextCursor);
}

// Item by item (ads, events, deliveries, or a batch job's items)
for await (const ad of adlib.paginateItems(adlib.advertisers.ads, { id: "meta:15087023444", source: "history" })) {
  console.log(ad.id);
}
```

Works with `ads.search`, `advertisers.ads`, `advertisers.changes`, `advertisers.timeline`,
`batch.get` and `webhooks.deliveries`. Iteration stops when `next_cursor` is null, when it repeats,
or after `maxPages` (default 10, `Infinity` for no limit). Every page is a billed call.

## Errors

API errors have the shape `{"error":{"code","message","request_id","billed"}}`. All SDK errors
extend `AdLibError`, which has `status`, `code`, `message`, `requestId`, `billed`, `platform`,
`details`, `body` and `headers`.

| Class                     | When                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| `ValidationError`         | 400 or 422 (`code: "unsupported"`: the platform cannot do this query or filter), or invalid arguments caught before sending |
| `AuthenticationError`     | 401: key missing or wrong, or no key configured                       |
| `InsufficientCreditsError`| 402: no credits left                                                  |
| `PermissionDeniedError`   | 403: key disabled, or `history_limit`: the ad is older than your plan's archive window (free 90 days, starter 365, growth and up unlimited) |
| `NotFoundError`           | 404: unknown id. Try `source: "history"` or `advertisers.resolve`     |
| `RateLimitError`          | 429 `rate_limited`. `retryAfter` holds the wait in seconds            |
| `QuotaExceededError`      | 429 `quota_exceeded`: monthly credits used up (extends `RateLimitError`) |
| `ServerError`             | 5xx. 502/503: an ad platform failed or is paused                      |
| `ConnectionError`         | Network failure, no response                                          |
| `TimeoutError`            | Request took longer than `timeoutMs`                                  |
| `WebhookSignatureError`   | Webhook signature missing, malformed, too old or wrong                |

```ts
import { AdLibError, NotFoundError, QuotaExceededError, RateLimitError } from "adlib-api";

try {
  await adlib.advertisers.get("meta:1");
} catch (err) {
  if (err instanceof NotFoundError) console.log("Unknown advertiser");
  else if (err instanceof QuotaExceededError) console.log("Monthly credits used up");
  else if (err instanceof RateLimitError) console.log(`Retry in ${err.retryAfter ?? "?"} s`);
  else if (err instanceof AdLibError) console.log(err.status, err.code, err.message, err.requestId);
  else throw err;
}
```

### Retries

Up to `maxRetries` times (default 2), with exponential backoff from 500 ms (capped at 8 s, with
jitter):

- **429 `rate_limited`** on every request, waiting `Retry-After` (capped at 60 s). The API rejects
  these before doing anything, so retrying a POST is safe.
- **502, 503, 504, timeouts and network errors** on GET, PATCH and DELETE only. POSTs (batch jobs,
  watchlists, test events, secret rotation) are not retried after they may have reached the API.
- Never: `quota_exceeded`, 500 and other 4xx errors.

Aborting the signal stops the request and any pending retry.

## Development

```sh
npm install
npm run typecheck
npm test        # node:test against a mocked fetch
npm run build   # dist/esm and dist/cjs
npm run smoke   # loads the built package through its exports map
```

## License

MIT
