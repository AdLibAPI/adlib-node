import type {
  AdList,
  AdvertiserResponse,
  AdvertiserStatsResponse,
  EventList,
  EventType,
  PlatformFilter,
  RequestOptions,
  ResolveResponse,
  Sort,
  Source,
  StatusFilter,
} from "../types.js";
import { APIResource, csv, dateParam, enc, intInRange, nonEmpty, oneOf, platforms, prefixedId } from "./shared.js";

const STATUSES: readonly StatusFilter[] = ["active", "inactive", "all"];
const SOURCES: readonly Source[] = ["live", "history"];
const SORTS: readonly Sort[] = ["newest", "days_running"];

export interface ResolveParams {
  /** e.g. nike.com */
  domain: string;
  /** Platforms to resolve on; omit for all. */
  platform?: PlatformFilter;
  /** 1 to 10, default 3. */
  maxPerPlatform?: number;
}

export interface GetAdvertiserParams {
  /** <platform>:<platform_advertiser_id>, e.g. meta:15087023444 */
  id: string;
  /** Crawl the first page of the advertiser's ads live before answering. */
  refresh?: boolean;
}

export interface AdvertiserAdsParams {
  id: string;
  /** Default all. */
  status?: StatusFilter;
  /** live (default), or history to include ads that vanished from the platform. */
  source?: Source;
  /** source=history only: days_running = longest-running first. */
  sort?: Sort;
  cursor?: string;
  /** 1 to 100, default 25. */
  limit?: number;
}

export interface ChangesParams {
  id: string;
  /** YYYY-MM-DD, RFC 3339 or a Date. Required. */
  since: string | Date;
  /** Default started, stopped, changed. */
  types?: EventType | readonly EventType[];
  cursor?: string;
  /** 1 to 200, default 50. */
  limit?: number;
}

export interface TimelineParams {
  id: string;
  /** Events at or after (YYYY-MM-DD, RFC 3339 or a Date). */
  from?: string | Date;
  to?: string | Date;
  cursor?: string;
  /** 1 to 200, default 50. */
  limit?: number;
}

/** Advertisers: resolve a domain, profiles, ads, changes, stats and timelines. */
export class Advertisers extends APIResource {
  /**
   * A brand's advertiser ids on Meta, Google, TikTok, LinkedIn, Pinterest and X from its domain,
   * each with a confidence `score` and `match_reason`.
   */
  resolve = (params: ResolveParams | string, options?: RequestOptions): Promise<ResolveResponse> => {
    const p = typeof params === "string" ? { domain: params } : params;
    return this.client.request(
      {
        path: "/v1/advertisers/resolve",
        query: {
          domain: nonEmpty("domain", p?.domain),
          platform: platforms(p.platform),
          max_per_platform: intInRange("maxPerPlatform", p.maxPerPlatform, 1, 10),
        },
      },
      options,
    );
  };

  /** An advertiser incl. active ads and ads known in the archive. */
  get = (id: string | GetAdvertiserParams, options?: RequestOptions): Promise<AdvertiserResponse> => {
    const p = typeof id === "string" ? { id } : id;
    return this.client.request(
      { path: `/v1/advertisers/${enc(prefixedId("id", p?.id))}`, query: { refresh: p.refresh } },
      options,
    );
  };

  /** All ads of an advertiser, live or from history. Paginated. */
  ads = (params: AdvertiserAdsParams, options?: RequestOptions): Promise<AdList> =>
    this.client.request(
      {
        path: `/v1/advertisers/${enc(prefixedId("id", params?.id))}/ads`,
        query: {
          status: oneOf("status", params.status, STATUSES),
          source: oneOf("source", params.source, SOURCES),
          sort: oneOf("sort", params.sort, SORTS),
          cursor: params.cursor,
          limit: intInRange("limit", params.limit, 1, 100),
        },
      },
      options,
    );

  /** New, stopped and changed ads since a point in time. Paginated. */
  changes = (params: ChangesParams, options?: RequestOptions): Promise<EventList> =>
    this.client.request(
      {
        path: `/v1/advertisers/${enc(prefixedId("id", params?.id))}/changes`,
        query: {
          since: nonEmpty("since", dateParam(params.since)),
          types: csv(params.types),
          cursor: params.cursor,
          limit: intInRange("limit", params.limit, 1, 200),
        },
      },
      options,
    );

  /**
   * Analytics from the history: ads by status, format, country and language; run-time
   * distribution; new ads per week; and the 5 longest-running ads (likely winners).
   */
  stats = (id: string, options?: RequestOptions): Promise<AdvertiserStatsResponse> =>
    this.client.request({ path: `/v1/advertisers/${enc(prefixedId("id", id))}/stats` }, options);

  /** When which ads started and stopped. Paginated. */
  timeline = (params: TimelineParams, options?: RequestOptions): Promise<EventList> =>
    this.client.request(
      {
        path: `/v1/advertisers/${enc(prefixedId("id", params?.id))}/timeline`,
        query: {
          from: dateParam(params.from),
          to: dateParam(params.to),
          cursor: params.cursor,
          limit: intInRange("limit", params.limit, 1, 200),
        },
      },
      options,
    );
}
