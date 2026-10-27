import type { CompanyResponse, PlatformFilter, RequestOptions } from "../types.js";
import { APIResource, enc, intInRange, nonEmpty, numberInRange, platforms } from "./shared.js";

export interface GetCompanyParams {
  /** e.g. audi.de */
  domain: string;
  /** Platforms to include; omit for all. */
  platform?: PlatformFilter;
  /** Accounts below this resolve score are candidates, not part of the totals. 0 to 1, default 0.75. */
  minScore?: number;
  /** Brands often run several accounts per platform (countries, product lines). 1 to 10, default 5. */
  maxPerPlatform?: number;
}

/** Companies: all ad accounts of a domain across platforms, with combined stats. */
export class Companies extends APIResource {
  /**
   * Resolves the domain (like advertisers.resolve, including our manual corrections), keeps
   * accounts with score >= minScore and aggregates their history: totals, platforms, countries,
   * formats, weekly launches and the longest-running ads. Accounts below the threshold are listed
   * as candidates. Costs one resolve plus one stats call.
   */
  get = (params: GetCompanyParams | string, options?: RequestOptions): Promise<CompanyResponse> => {
    const p = typeof params === "string" ? { domain: params } : params;
    return this.client.request(
      {
        path: `/v1/companies/${enc(nonEmpty("domain", p?.domain))}`,
        query: {
          platform: platforms(p.platform),
          min_score: numberInRange("minScore", p.minScore, 0, 1),
          max_per_platform: intInRange("maxPerPlatform", p.maxPerPlatform, 1, 10),
        },
      },
      options,
    );
  };
}
