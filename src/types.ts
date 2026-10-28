// Types for the AdLib API v1, from docs/openapi.yaml. Fields a platform does not provide are
// null, never estimated. Timestamps are RFC 3339 strings.

export type Platform =
  | "meta"
  | "google"
  | "tiktok"
  | "linkedin"
  | "pinterest"
  | "x"
  | "snapchat"
  | "apple"
  | "amazon"
  | "microsoft";
/** Every platform ads can come from. microsoft is in beta. */
export const PLATFORMS: readonly Platform[] = [
  "meta",
  "google",
  "tiktok",
  "linkedin",
  "pinterest",
  "x",
  "snapchat",
  "apple",
  "amazon",
  "microsoft",
];

/**
 * Search-only aliases: youtube and play are Google ads on YouTube or Google Play (the same as
 * platform google with placement youtube or play).
 */
export type PlatformAlias = "youtube" | "play";

/** One or more platforms. Arrays are sent comma-separated. */
export type PlatformFilter = Platform | PlatformAlias | readonly (Platform | PlatformAlias)[] | string;

/** Google only: where the ad ran. */
export type Placement = "youtube" | "search" | "shopping" | "maps" | "play";

export type AdStatus = "active" | "inactive" | "unknown";
export type StatusFilter = "active" | "inactive" | "all";
export type Source = "live" | "history";
export type Sort = "newest" | "days_running";
export type AdFormat = "image" | "video" | "carousel" | "text";
/** removed: the platform's library no longer shows the ad (we keep it). */
export type EventType = "started" | "stopped" | "changed" | "discovered" | "removed";
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
  /**
   * Why this ad likely performs, from public facts only: long_running (running > 30 days),
   * still_running_90d (active and running > 90 days), scaled (3+ variants with the same text),
   * wide_reach (EU reach >= 100,000), multi_country (shown in 5+ countries).
   */
  signals: AdSignal[] | null;
  /** testing = no signal yet, scaling = one signal, proven = two or more. null when the run length is unknown. */
  stage: AdStage | null;
}

export type AdSignal = "long_running" | "still_running_90d" | "scaled" | "wide_reach" | "multi_country" | (string & {});
export type AdStage = "testing" | "scaling" | "proven";

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
  /**
   * When the platform's library stopped showing this ad (taken down, deleted by the advertiser or
   * past the library's retention). We keep it; null while the library still has it.
   */
  removed_from_library_at: string | null;
  formats: string[] | null;
  creatives: Creative[] | null;
  placements: string[] | null;
  /** ISO 3166-1 alpha-2 */
  countries: string[] | null;
  eu_data: EUData;
  spend_range: Range;
  impressions_range: Range;
  derived: Derived;
  /** Political or issue ad. Meta only; null where the platform doesn't label it. */
  political: boolean | null;
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

/** An account's relation to a domain: the brand itself, or an agency, reseller (dealer, importer) or partner running ads for it. */
export type AdvertiserRole = "brand" | "agency" | "reseller" | "partner" | "unknown";

export interface ResolvedAdvertiser extends Advertiser {
  /** 0..1 confidence that this advertiser belongs to the domain. */
  score: number;
  /** manual = confirmed by us (or from a customer report we accepted). */
  match_reason: "domain" | "name" | "history" | "manual";
  role: AdvertiserRole;
  /** manual = set by us; inferred = from the account name. */
  role_source: "manual" | "inferred";
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

/** A page as CSV (`output=csv`). */
export interface CsvPage {
  /** Header row plus one row per item of `data` (an object becomes one row). */
  csv: string;
  /** From the X-Next-Cursor header; pass it back as `cursor`. null on the last page. */
  nextCursor: string | null;
}

export interface ListMeta {
  count: number;
  cached: boolean;
  source: Source;
  platforms?: string[] | null;
  /** Platforms that failed (not billed). */
  errors?: PlatformFailure[] | null;
  /**
   * Matching ads per platform as the platform reports them, where it does: how much there is
   * beyond this page.
   */
  platform_totals?: Record<string, number>;
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

export interface ReachPoint {
  day: string;
  reach_total: number;
  reach_by_country?: Record<string, number>;
}

export interface AdHistory {
  ad_id: string;
  versions: Version[] | null;
  status_periods: Period[] | null;
  events: EventOut[] | null;
  /** EU reach per day (Meta ads delivered in the EU), oldest first. */
  reach: ReachPoint[] | null;
}

// Creative features (GET /v1/ads/{id}/features). Every tag carries the text it matched.

/** A text tag with the exact text it matched. */
export interface FeatureMatch {
  rule: string;
  text: string;
}

export interface TextFeatures {
  /** First sentence of the primary text. */
  hook: string;
  hook_is_question: boolean;
  chars: number;
  words: number;
  emojis: number;
  /** Share of letters in capitals. */
  uppercase_ratio: number;
  hashtags: string[] | null;
  mentions: string[] | null;
  numbers: string[] | null;
  prices: string[] | null;
  discounts: string[] | null;
  free_shipping: FeatureMatch[] | null;
  urgency: FeatureMatch[] | null;
  social_proof: FeatureMatch[] | null;
  guarantee: FeatureMatch[] | null;
  free_offer: FeatureMatch[] | null;
  novelty: FeatureMatch[] | null;
}

export interface OCRResult {
  /** Text on the image; for videos, the distinct on-screen texts across the whole video, one per line. */
  text: string;
  /** Mean confidence 0..1 of the words kept; words read with less than 0.75 are dropped. */
  confidence: number;
  languages: string;
  /** Videos: when each text is on screen, in order of appearance. */
  timeline?: OCRSpan[];
}

export interface OCRSpan {
  /** Seconds from the start of the video. */
  start: number;
  /** Seconds; the text is on screen until here. */
  end: number;
  text: string;
}

export interface MediaFeatures {
  kind: "image" | "video";
  url: string;
  width?: number;
  height?: number;
  /** 9:16, 4:5, 1:1, 16:9 or WxH reduced. */
  aspect?: string;
  orientation?: "vertical" | "square" | "horizontal";
  duration_s?: number;
  has_audio?: boolean;
  /** Hard cuts detected (ffmpeg scene score > 0.4). */
  scene_cuts?: number;
  cuts_per_minute?: number;
  ocr?: OCRResult;
  error?: string;
}

export interface LandingFeatures {
  url: string;
  domain: string;
  path: string;
  utm: Record<string, string>;
}

export interface AdFeatures {
  version: string;
  /** rules = text tags with evidence, measurement = measured from the media, ocr = text read from images and video frames. */
  method: string;
  /**
   * From the measured media: vertical_video, horizontal_video, square_video, vertical_image,
   * square_image, horizontal_image, carousel, text_only.
   */
  format: string;
  text: TextFeatures;
  media: MediaFeatures[] | null;
  headline?: string;
  cta?: string;
  landing?: LandingFeatures;
  ocr_text?: string;
}

export interface TimedText {
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  text: string;
}

export interface AdTranscript {
  media: {
    url: string;
    duration_s: number;
    /** Spoken language, e.g. "en"; absent when nobody speaks. */
    language?: string;
    text: string;
    segments: TimedText[];
    error?: string;
  }[];
}

export interface AdAIRead {
  summary: string;
  /** The opening words as the viewer meets them, in the ad's language. */
  hook: string;
  hook_type: "question" | "bold_claim" | "problem" | "offer" | "social_proof" | "curiosity" | "demonstration" | "testimonial" | "news" | "other";
  angles: string[];
  emotions: string[];
  audience: string;
  style: "ugc" | "talking_head" | "studio" | "product_demo" | "animation" | "slideshow" | "static_image" | "text_only" | "other";
  cta: string;
  offer: string;
  language: string;
  model: string;
  with_transcript: boolean;
}

export interface AdFeaturesResponse {
  /** null while `meta.status` is `processing`. */
  data: (AdFeatures & { transcript?: AdTranscript; ai?: AdAIRead }) | null;
  meta: {
    ad_id: string;
    /** `processing`: still being worked on (HTTP 202, not billed); ask again after `retry_after` seconds. */
    status: "ready" | "processing";
    /** The part being worked on (processing only). */
    pending?: "features" | "transcript" | "ai";
    included?: FeaturesInclude[];
    /** Credits by part: features, transcript, ai. */
    credits?: Record<string, number>;
    /** Parts that failed (not billed), with the reason. */
    errors?: Record<string, string>;
    /** Seconds to wait before asking again (processing only). */
    retry_after?: number;
    /** Served from an earlier analysis of the same ad version. */
    cached: boolean;
    analyzed_at?: string;
  };
}

export type FeaturesInclude = "transcript" | "ai";

export interface FeaturesOptions extends RequestOptions {
  /** Optional parts: `transcript` (what is said in the videos, +10 credits per started minute), `ai` (AI read, +5 credits). */
  include?: FeaturesInclude[];
  /** Ask again while the API is still analysing the media (default true). */
  wait?: boolean;
  /** Give up waiting after this long and return the `processing` answer (default 120000). */
  maxWaitMs?: number;
}

export interface LibraryUrlResponse {
  data: {
    kind: "ad" | "advertiser";
    platform: string;
    /** <platform>:<id>, usable in every endpoint. */
    id: string;
    /** The AdLib call that fetches it, e.g. /v1/ads/meta:1187430977361020 */
    href: string;
  };
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
  /** Ads the platform labels political or issue ads (Meta only). */
  political_ads: number;
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

export type ReportKind = "wrong_match" | "missing_match" | "wrong_role";
/** The role a report says the account should have. */
export type ReportRole = Exclude<AdvertiserRole, "unknown">;
export type ReportStatus = "open" | "accepted" | "rejected";

export interface ResolveReport {
  id: number;
  domain: string;
  advertiser_id: string | null;
  kind: ReportKind;
  /** wrong_role / missing_match: the role the account should have. */
  role: ReportRole | null;
  note: string | null;
  status: ReportStatus;
  /** Our answer when the report was reviewed. */
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ResolveReportResponse {
  data: ResolveReport;
}

export interface ResolveReportsResponse {
  data: ResolveReport[] | null;
}

export interface FamilyBrand {
  name: string;
  domain: string;
}

/** The parent company and its other brands, when known (reviewed by us). */
export interface CompanyFamily {
  parent: string;
  parent_domain: string | null;
  brands: FamilyBrand[] | null;
}

export interface CompanyPlatform {
  platform: string;
  /** Accounts on this platform that count towards the totals. */
  accounts: number;
  total_ads_known: number;
  active_ads: number;
}

export interface Company {
  domain: string;
  /** Name of the most confident account. */
  name: string;
  /** The company's own accounts (role brand or unknown) with score >= min_score. */
  accounts: ResolvedAdvertiser[] | null;
  /** Agencies, resellers and partners running ads for the domain. Not in platforms and stats unless includeRelated. */
  related: ResolvedAdvertiser[] | null;
  /** Possible accounts below min_score; report wrong ones with advertisers.reportMatch. */
  candidates: ResolvedAdvertiser[] | null;
  platforms: CompanyPlatform[] | null;
  /** Combined history of the accounts, plus related with includeRelated (advertiser_id is the domain). */
  stats: AdvertiserStats;
  family?: CompanyFamily;
  errors?: PlatformFailure[] | null;
}

export interface CompanyResponse {
  data: Company;
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
    /**
     * Flat view for Clay, Sheets or Zapier: advertising, platforms_advertising (comma-separated),
     * total_active_ads, latest_ad_at, and per platform <platform>_advertising,
     * <platform>_active_ads and <platform>_advertiser_id.
     */
    columns: Record<string, unknown>;
    checked_at: string;
  };
}

export interface DomainSuggestion {
  domain: string;
  /** Most common advertiser name for the domain. */
  name: string;
  platforms: string[] | null;
  advertisers: number;
  ads_known: number;
}

export interface DomainSuggestionsResponse {
  data: DomainSuggestion[] | null;
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
  /** Crawl interval, as set with intervalHours on create. */
  interval_hours: number;
  archive_videos: boolean;
  /** A digest of each crawl's changes goes to the account's email. */
  email_alerts: boolean;
  created_at: string;
  advertiser_count: number;
  /** Empty in watchlists.list(); watchlists.get(id) has the entries. */
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
  /** How far back archived ads are available: 0 = unlimited. */
  history_days: number;
  /** Shortest watchlist crawl interval of the plan. */
  min_interval_hours: number;
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

export interface CoveragePlatform {
  platform: string;
  ads: number;
  active_ads: number;
  new_7d: number;
}

export interface Coverage {
  /** Ads in the archive. */
  ads: number;
  active_ads: number;
  /** Creative versions kept (every change is a version). */
  ad_versions: number;
  /** Images and videos stored permanently. */
  media: number;
  advertisers: number;
  /** Advertisers we crawl on a schedule. */
  tracked_advertisers: number;
  tracked_domains: number;
  /** Ads the platforms' libraries no longer show that we keep. */
  removed_kept: number;
  /** Daily EU reach measurements. */
  eu_reach_points: number;
  crawled_24h: number;
  last_crawl: string | null;
  platforms: CoveragePlatform[] | null;
  updated_at: string;
}

export interface CoverageResponse {
  data: Coverage;
}

// ---------------------------------------------------------------------------
// Webhook events (the JSON body POSTed to your endpoint)
// ---------------------------------------------------------------------------

export interface AdvertiserChangesEvent {
  event: "advertiser.changes";
  watchlist_id: string;
  advertiser_id: string;
  crawled_at: string;
  summary: { new: number; started: number; stopped: number; changed: number; removed: number };
  new: EventOut[];
  started: EventOut[];
  stopped: EventOut[];
  changed: EventOut[];
  /** Ads the platform's library no longer shows (we keep them). */
  removed: EventOut[];
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
