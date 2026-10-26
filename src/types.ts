// Types for the AdLib API v1, from docs/openapi.yaml. Fields a platform does not provide are
// null, never estimated. Timestamps are RFC 3339 strings.

export type Platform = "meta" | "google" | "tiktok" | "linkedin" | "pinterest" | "x";
export const PLATFORMS: readonly Platform[] = ["meta", "google", "tiktok", "linkedin", "pinterest", "x"];

/** One or more platforms. Arrays are sent comma-separated. */
export type PlatformFilter = Platform | readonly Platform[] | string;

export type AdStatus = "active" | "inactive" | "unknown";
export type StatusFilter = "active" | "inactive" | "all";
export type Source = "live" | "history";
export type Sort = "newest" | "days_running";
export type AdFormat = "image" | "video" | "carousel" | "text";
export type EventType = "started" | "stopped" | "changed" | "discovered";
export type JobStatus = "queued" | "running" | "done" | "failed";
export type DeliveryStatus = "pending" | "delivered" | "failed";

/** Per-call options accepted as the last argument of every method. */
export interface RequestOptions {
  /** Aborts the request (and any pending retry). */
  signal?: AbortSignal;
  /** Overrides the client's per-attempt timeout. */
  timeoutMs?: number;
  /** Overrides the client's retry count. */
  maxRetries?: number;
}

export type QueryValue = string | number | boolean | undefined | null;

// ---------------------------------------------------------------------------
// Shared objects
// ---------------------------------------------------------------------------

export interface Range {
  lower: number | null;
  upper: number | null;
  currency?: string;
}

export interface AdvertiserRef {
  /** <platform>:<platform_advertiser_id> */
  id: string;
  name: string;
  platform_advertiser_id: string;
  domain: string | null;
  verified: boolean | null;
}

export interface Media {
  kind: "image" | "video";
  /** Archived URL (stable). */
  url: string;
  sha256: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  original_url?: string;
  preview_url?: string;
}

export interface Creative {
  type: string;
  text: string | null;
  headline: string | null;
  cta: string | null;
  landing_url: string | null;
  media: Media[] | null;
}

export interface Targeting {
  ages: string[] | null;
  genders: string[] | null;
  locations: string[] | null;
  other?: Record<string, string[] | null>;
}

export interface EUData {
  reach_total: number | null;
  reach_by_country: Record<string, number>;
  reach_by_country_range?: Record<string, Range>;
  reach_range?: Range;
  targeting: Targeting;
  payer: string | null;
  beneficiary: string | null;
}

export interface Derived {
  days_running: number | null;
  /** days_running > 30 */
  is_long_running: boolean | null;
  /** ISO 639-1 of the primary ad text. */
  language: string | null;
  /** Ads sharing this ad's primary text for the same advertiser. */
  variant_count: number | null;
}

export interface Ad {
  /** Stable ID: <platform>:<platform_ad_id> */
  id: string;
  platform: Platform;
  platform_ad_id: string;
  advertiser: AdvertiserRef;
  status: AdStatus;
  first_shown: string | null;
  last_shown: string | null;
  first_seen_by_us: string | null;
  last_seen_by_us: string | null;
  formats: string[] | null;
  creatives: Creative[] | null;
  placements: string[] | null;
  /** ISO 3166-1 alpha-2 */
  countries: string[] | null;
  eu_data: EUData;
  spend_range: Range;
  impressions_range: Range;
  derived: Derived;
  library_url?: string;
  /** Pointer to the archived raw upstream record. */
  raw_ref?: string;
  /** Platform-specific fields. */
  extra?: Record<string, unknown>;
}

export interface Advertiser {
  id: string;
  platform: string;
  platform_advertiser_id: string;
  name: string;
  domain: string | null;
  verified: boolean | null;
  country: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  /** As reported by the platform if available, else counted by us. */
  active_ads: number | null;
  /** Ads in our history. */
  total_ads_known: number;
  first_seen_by_us: string | null;
  last_seen_by_us: string | null;
  extra?: Record<string, unknown>;
}

export interface ResolvedAdvertiser extends Advertiser {
  /** 0..1 confidence that this advertiser belongs to the domain. */
  score: number;
  match_reason: "domain" | "name" | "history";
}

export interface PlatformFailure {
  platform: string;
  code: string;
  message: string;
}

export interface EventOut {
  type: EventType;
  at: string;
  ad_id?: string;
  ad?: Ad;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** Any response with a cursor: pass `next_cursor` back as `cursor`; null means last page. */
export interface CursorPage {
  next_cursor: string | null;
}

export interface ListMeta {
  count: number;
  cached: boolean;
  source: Source;
  platforms?: string[] | null;
  /** Platforms that failed (not billed). */
  errors?: PlatformFailure[] | null;
}

export interface AdList extends CursorPage {
  data: Ad[] | null;
  meta: ListMeta;
}

export interface AdResponse {
  data: Ad;
  meta: {
    /** live = fetched from the platform now; history = platform no longer serves it. */
    source: "live" | "cache" | "history";
  };
}

export interface Version {
  valid_from: string;
  valid_to: string | null;
  creatives: Creative[] | null;
}

export interface Period {
  active_from: string;
  active_to: string | null;
}

export interface AdHistory {
  ad_id: string;
  versions: Version[] | null;
  status_periods: Period[] | null;
  events: EventOut[] | null;
}

export interface AdHistoryResponse {
  data: AdHistory;
}

export interface ResolveResponse {
  data: {
    domain: string;
    advertisers: ResolvedAdvertiser[] | null;
    errors?: PlatformFailure[] | null;
  };
}

export interface AdvertiserResponse {
  data: Advertiser;
}

export interface EventList extends CursorPage {
  data: EventOut[] | null;
  meta: {
    count: number;
    summary: Record<string, number>;
  };
}

export interface DaysRunningStats {
  median: number | null;
  p90: number | null;
  max: number | null;
  /** Ads running longer than the long-running threshold. */
  long_running: number;
  /** Ads with a known start date. */
  known: number;
}

export interface WeekCount {
  week: string;
  count: number;
}

export interface AdvertiserStats {
  advertiser_id: string;
  /** Ads in our history (incl. ads gone from the platform). */
  total_ads: number;
  by_status: Record<string, number>;
  by_format: Record<string, number>;
  /** Top 25 countries. */
  by_country: Record<string, number>;
  by_language: Record<string, number>;
  days_running: DaysRunningStats;
  /** Ads first shown per ISO week, last 12 weeks. */
  new_ads_weekly: WeekCount[] | null;
  first_ad_at: string | null;
  latest_ad_at: string | null;
  /** Top 5 by days_running: the advertiser's likely winners. */
  longest_running_ads: Ad[] | null;
}

export interface AdvertiserStatsResponse {
  data: AdvertiserStats;
}

export interface PlatformCheck {
  platform: string;
  advertising: boolean | null;
  /** Platform-reported count when available, else counted in the sample. */
  active_ads: number | null;
  latest_ad_at: string | null;
  sample_ad_ids: string[] | null;
  advertiser?: string;
  advertiser_id?: string;
  score?: number;
  error?: string;
}

export interface DomainCheckResponse {
  data: {
    domain: string;
    /** true if at least one platform shows a current ad; null if no platform could be checked. */
    advertising: boolean | null;
    platforms: PlatformCheck[] | null;
    checked_at: string;
  };
}

export interface BatchJob {
  job_id: string;
  status: JobStatus;
  kind: string;
  params: unknown;
  webhook_url: string | null;
  total: number;
  done: number;
  failed: number;
  credits_billed: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface BatchCreatedResponse {
  data: BatchJob;
}

export interface BatchItem {
  input: string;
  status: JobStatus;
  error: string | null;
  ads: Ad[] | null;
  advertisers: Advertiser[] | null;
}

export interface BatchResponse extends CursorPage {
  data: BatchJob;
  items: BatchItem[] | null;
}

export interface WatchlistEntry {
  advertiser_id: string;
  name: string;
  last_crawl_at: string | null;
  next_crawl_at: string;
  last_error: string | null;
  active_ads_known: number;
}

export interface Watchlist {
  id: string;
  name: string;
  webhook_url: string | null;
  interval_seconds: number;
  archive_videos: boolean;
  created_at: string;
  advertisers: WatchlistEntry[] | null;
}

export interface WatchlistResponse {
  data: Watchlist;
}

export interface WatchlistsResponse {
  data: Watchlist[] | null;
}

export interface Delivery {
  id: number;
  url: string;
  event: string;
  status: DeliveryStatus;
  attempts: number;
  response_status: number | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
  next_attempt?: string;
  /** Only on webhooks.delivery(id). */
  payload?: unknown;
}

export interface DeliveriesResponse extends CursorPage {
  data: Delivery[] | null;
}

export interface DeliveryResponse {
  data: Delivery;
}

export interface QueuedResponse {
  delivery_id: number;
  status: string;
}

export interface WebhookSecretResponse {
  data: {
    /** whsec_... */
    secret: string;
    version: number;
  };
}

export interface UsageRow {
  day: string;
  endpoint: string;
  requests: number;
  units: number;
}

export interface UsageMonth {
  month: string;
  endpoint: string;
  requests: number;
  units: number;
}

export interface Plan {
  name: string;
  requests_per_minute: number;
  monthly_credits: number;
  max_batch_items: number;
  max_watchlist_advertisers: number;
  history_access: boolean;
}

export interface UsageResponse {
  owner: string;
  plan: Plan;
  credits_this_month: number;
  /** Daily rows (kept 90 days). */
  data: UsageRow[] | null;
  /** Older usage folded into monthly totals. */
  monthly: UsageMonth[] | null;
}

export interface StatusWindow {
  requests: number;
  ok: number;
  errors: number;
  blocked: number;
  success_rate: number | null;
  avg_latency_ms: number | null;
  proxy_bytes: number;
  proxy_cost_usd: number | null;
  results: number;
  bytes_per_result: number | null;
  proxy_cost_per_1k_results_usd: number | null;
}

export interface SmokeCheck {
  name: string;
  ok: boolean;
  latency_ms: number;
  results: number;
  error?: string;
}

export interface SmokeResult {
  platform: string;
  at: string;
  ok: boolean;
  checks: SmokeCheck[] | null;
}

export interface PlatformStatus {
  platform: string;
  enabled: boolean;
  state: "operational" | "degraded" | "down" | "disabled";
  circuit_breaker: string;
  last_hour: StatusWindow;
  last_24h: StatusWindow;
  last_smoke_test: SmokeResult;
  proxy_tier?: string;
}

export interface StatusResponse {
  status: "operational" | "degraded" | "down";
  platforms: PlatformStatus[] | null;
  version: string;
}

/** Field names are as the API sends them (PascalCase, except beta). */
export interface Capabilities {
  SearchKeyword: boolean;
  SearchAdvertiser: boolean;
  SearchAdvertiserID: boolean;
  SearchDomain: boolean;
  GetAd: boolean;
  FilterCountry: boolean;
  FilterDate: boolean;
  FilterFormat: boolean;
  FilterStatus: boolean;
  Regions: string[] | null;
  EUOnly: boolean;
  beta?: boolean;
}

export interface PlatformInfo {
  platform: string;
  enabled: boolean;
  capabilities: Capabilities;
}

export interface PlatformsResponse {
  data: PlatformInfo[] | null;
}

// ---------------------------------------------------------------------------
// Webhook events (the JSON body POSTed to your endpoint)
// ---------------------------------------------------------------------------

export interface AdvertiserChangesEvent {
  event: "advertiser.changes";
  watchlist_id: string;
  advertiser_id: string;
  crawled_at: string;
  summary: { new: number; started: number; stopped: number; changed: number };
  new: EventOut[];
  started: EventOut[];
  stopped: EventOut[];
  changed: EventOut[];
}

export interface BatchCompletedEvent {
  event: "batch.completed";
  job: BatchJob;
}

export interface WebhookPingEvent {
  event: "webhook.ping";
  sent_at: string;
  message: string;
}

export type WebhookEvent = AdvertiserChangesEvent | BatchCompletedEvent | WebhookPingEvent;
