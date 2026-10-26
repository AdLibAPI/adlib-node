import type { RequestOptions, WatchlistResponse, WatchlistsResponse } from "../types.js";
import { ValidationError } from "../errors.js";
import { APIResource, compact, enc, intInRange, nonEmpty, prefixedId } from "./shared.js";

export interface CreateWatchlistParams {
  /** Advertiser ids <platform>:<id> (find them with advertisers.resolve). */
  advertisers: string[];
  /** Up to 200 characters. */
  name?: string;
  /** Receives advertiser.changes events (new, stopped and changed ads). */
  webhookUrl?: string;
  /** Crawl interval, 1 to 168 hours, default 24. */
  intervalHours?: number;
  /** Keep full video files for these advertisers (default true). */
  archiveVideos?: boolean;
}

function advertiserIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new ValidationError("advertisers must be a non-empty array");
  return value.map((v, i) => prefixedId(`advertisers[${i}]`, v));
}

/** Watchlists: we crawl the advertisers regularly and call your webhook on changes. */
export class Watchlists extends APIResource {
  /** Your watchlists. */
  list = (options?: RequestOptions): Promise<WatchlistsResponse> =>
    this.client.request({ path: "/v1/watchlists" }, options);

  /** Creates a watchlist. Not retried on 5xx, so it is never created twice. */
  create = (params: CreateWatchlistParams, options?: RequestOptions): Promise<WatchlistResponse> => {
    if (params?.name !== undefined && params.name.length > 200) throw new ValidationError("name must be at most 200 characters");
    return this.client.request(
      {
        method: "POST",
        path: "/v1/watchlists",
        body: compact({
          advertisers: advertiserIds(params?.advertisers),
          name: params.name,
          webhook_url: params.webhookUrl,
          interval_hours: intInRange("intervalHours", params.intervalHours, 1, 168),
          archive_videos: params.archiveVideos,
        }),
      },
      options,
    );
  };

  /** A watchlist with the crawl status of each advertiser. */
  get = (id: string, options?: RequestOptions): Promise<WatchlistResponse> =>
    this.client.request({ path: `/v1/watchlists/${enc(nonEmpty("id", id))}` }, options);

  /** Deletes a watchlist. */
  delete = async (id: string, options?: RequestOptions): Promise<void> => {
    await this.client.request({ method: "DELETE", path: `/v1/watchlists/${enc(nonEmpty("id", id))}` }, options);
  };

  /** Adds advertisers to a watchlist. */
  addAdvertisers = (id: string, advertisers: string[], options?: RequestOptions): Promise<WatchlistResponse> =>
    this.client.request(
      {
        method: "POST",
        path: `/v1/watchlists/${enc(nonEmpty("id", id))}/advertisers`,
        body: { advertisers: advertiserIds(advertisers) },
      },
      options,
    );

  /** Removes an advertiser from a watchlist. */
  removeAdvertiser = async (id: string, advertiserId: string, options?: RequestOptions): Promise<void> => {
    await this.client.request(
      {
        method: "DELETE",
        path: `/v1/watchlists/${enc(nonEmpty("id", id))}/advertisers/${enc(prefixedId("advertiserId", advertiserId))}`,
      },
      options,
    );
  };
}
