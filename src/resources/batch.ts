import type { BatchCreatedResponse, BatchResponse, Platform, RequestOptions } from "../types.js";
import { ValidationError } from "../errors.js";
import { APIResource, compact, enc, intInRange, nonEmpty, oneOf } from "./shared.js";

export type BatchType = "advertisers" | "domains" | "ads";
const TYPES: readonly BatchType[] = ["advertisers", "domains", "ads"];

export interface BatchOptions {
  country?: string;
  /** domains: also fetch the first page of ads of each matched advertiser. */
  include_ads?: boolean;
  /** advertisers: pages per advertiser (0 to 20, default 3). */
  max_pages?: number;
  /** domains: restrict resolution to these platforms. */
  platforms?: Platform[] | string[];
  status?: "active" | "inactive" | "";
}

export interface CreateBatchParams {
  /** What the items are. */
  type: BatchType;
  /** Advertiser ids (<platform>:<id>), domains, or ad ids. The limit depends on your plan. */
  items: string[];
  options?: BatchOptions;
  /** POSTed (signed) when the job completes, event batch.completed. */
  webhookUrl?: string;
}

export interface GetBatchParams {
  jobId: string;
  cursor?: string;
  /** Items per page, 1 to 100, default 20. */
  limit?: number;
}

/** Asynchronous batch jobs for many advertisers, domains or ad ids. */
export class Batch extends APIResource {
  /**
   * Starts a batch job. Billing is per delivered result in credits (same prices as the
   * synchronous endpoints), not per job. Not retried on 5xx, so a job is never started twice.
   */
  create = (params: CreateBatchParams, options?: RequestOptions): Promise<BatchCreatedResponse> => {
    if (!Array.isArray(params?.items) || params.items.length === 0) {
      throw new ValidationError("items must be a non-empty array");
    }
    const items = params.items.map((v, i) => nonEmpty(`items[${i}]`, v));
    if (params.options?.max_pages !== undefined) intInRange("options.max_pages", params.options.max_pages, 0, 20);
    return this.client.request(
      {
        method: "POST",
        path: "/v1/batch",
        body: compact({
          type: oneOf("type", params.type, TYPES) ?? nonEmpty("type", params.type),
          items,
          options: params.options,
          webhook_url: params.webhookUrl,
        }),
      },
      options,
    );
  };

  /** Job status and results. Finished jobs are kept for 30 days. Paginated over `items`. */
  get = (params: GetBatchParams, options?: RequestOptions): Promise<BatchResponse> => {
    const p = params;
    return this.client.request(
      {
        path: `/v1/batch/${enc(nonEmpty("jobId", p?.jobId))}`,
        query: { cursor: p.cursor, limit: intInRange("limit", p.limit, 1, 100) },
      },
      options,
    );
  };
}
