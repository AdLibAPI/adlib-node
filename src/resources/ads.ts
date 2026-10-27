import type {
  AdFormat,
  AdHistoryResponse,
  AdList,
  AdResponse,
  PlatformFilter,
  RequestOptions,
  Sort,
  Source,
  StatusFilter,
} from "../types.js";
import { ValidationError } from "../errors.js";
import { APIResource, enc, intInRange, oneOf, platforms, prefixedId } from "./shared.js";

const STATUSES: readonly StatusFilter[] = ["active", "inactive", "all"];
const SOURCES: readonly Source[] = ["live", "history"];
const SORTS: readonly Sort[] = ["newest", "days_running"];
const FORMATS: readonly AdFormat[] = ["image", "video", "carousel", "text"];

export interface SearchParams {
  /** Keyword in the ad text. Exactly one of q, advertiser and domain is required. */
  q?: string;
  /** Advertiser name, or our advertiser id <platform>:<id>. */
  advertiser?: string;
  /** Landing page / advertiser domain. */
  domain?: string;
  /** Platforms to query; omit for all that support the query. */
  platform?: PlatformFilter;
  /** ISO 3166-1 alpha-2, e.g. DE. */
  country?: string;
  /** Default all. */
  status?: StatusFilter;
  /** Shown on or after (YYYY-MM-DD). */
  from?: string;
  /** Shown before (YYYY-MM-DD). */
  to?: string;
  format?: AdFormat;
  /** true = only political or issue ads, false = none. Only Meta labels them, so true limits results to Meta. */
  political?: boolean;
  /** live (default) or history: our own archive, including ads gone from the platforms. */
  source?: Source;
  /** source=history only: days_running = longest-running ads first (likely winners). */
  sort?: Sort;
  cursor?: string;
  /** Page size hint, 1 to 100 (platforms have native page sizes; history honours it exactly). */
  limit?: number;
}

export interface GetAdParams {
  /** Our ad id <platform>:<platform_ad_id>, e.g. meta:1234567890. */
  id: string;
  /** Serve from our archive if we saw the ad within this many seconds (0 = always live). Default 3600. */
  maxAge?: number;
}

/** Ads: search, one ad, and its history. */
export class Ads extends APIResource {
  /**
   * Searches ads, across all platforms when `platform` is omitted. Platforms that fail are listed
   * in `meta.errors` and not billed. Paginated.
   */
  search = (params: SearchParams, options?: RequestOptions): Promise<AdList> => {
    const modes = [params?.q, params?.advertiser, params?.domain].filter((v) => typeof v === "string" && v.trim());
    if (modes.length !== 1) throw new ValidationError("Pass exactly one of q, advertiser or domain");
    return this.client.request(
      {
        path: "/v1/search",
        query: {
          q: params.q?.trim(),
          advertiser: params.advertiser?.trim(),
          domain: params.domain?.trim(),
          platform: platforms(params.platform),
          country: params.country,
          status: oneOf("status", params.status, STATUSES),
          from: params.from,
          to: params.to,
          format: oneOf("format", params.format, FORMATS),
          political: params.political,
          source: oneOf("source", params.source, SOURCES),
          sort: oneOf("sort", params.sort, SORTS),
          cursor: params.cursor,
          limit: intInRange("limit", params.limit, 1, 100),
        },
      },
      options,
    );
  };

  /**
   * One ad, fetched live from its platform (which also updates the history). If the platform no
   * longer has it, the archived version is returned with `meta.source = "history"`.
   */
  get = (id: string | GetAdParams, options?: RequestOptions): Promise<AdResponse> => {
    const p = typeof id === "string" ? { id } : id;
    return this.client.request(
      {
        path: `/v1/ads/${enc(prefixedId("id", p?.id))}`,
        query: { max_age: intInRange("maxAge", p.maxAge, 0, Number.MAX_SAFE_INTEGER) },
      },
      options,
    );
  };

  /** All observed versions, status periods and events of an ad. */
  history = (id: string, options?: RequestOptions): Promise<AdHistoryResponse> =>
    this.client.request({ path: `/v1/ads/${enc(prefixedId("id", id))}/history` }, options);
}
