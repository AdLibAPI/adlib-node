import type { DomainCheckResponse, DomainSuggestionsResponse, PlatformFilter, RequestOptions } from "../types.js";
import { ValidationError } from "../errors.js";
import { APIResource, enc, intInRange, nonEmpty, platforms } from "./shared.js";

export interface CheckDomainParams {
  /** e.g. nike.com */
  domain: string;
  /** Platforms to check; omit for all. */
  platform?: PlatformFilter;
}

export interface SuggestDomainsParams {
  /** 2 to 100 characters: the start of a domain or advertiser name, e.g. nik */
  q: string;
  /** 1 to 20, default 8. */
  limit?: number;
}

/** Domains: is this company advertising right now, and where? */
export class Domains extends APIResource {
  /**
   * Resolves the domain on all platforms and checks for current ads. Built for lead enrichment:
   * one flat price per check, free if nothing could be checked.
   */
  check = (params: CheckDomainParams | string, options?: RequestOptions): Promise<DomainCheckResponse> => {
    const p = typeof params === "string" ? { domain: params } : params;
    return this.client.request(
      { path: `/v1/domains/${enc(nonEmpty("domain", p?.domain))}/check`, query: { platform: platforms(p.platform) } },
      options,
    );
  };

  /**
   * Domain suggestions from our index while typing (free). Prefix match on domains and advertiser
   * names we already know, most archived ads first. Never asks the platforms.
   */
  suggest = (params: SuggestDomainsParams | string, options?: RequestOptions): Promise<DomainSuggestionsResponse> => {
    const p = typeof params === "string" ? { q: params } : params;
    const q = nonEmpty("q", p?.q);
    if (q.length < 2 || q.length > 100) throw new ValidationError("q must be 2 to 100 characters");
    return this.client.request(
      { path: "/v1/domains/suggest", query: { q, limit: intInRange("limit", p.limit, 1, 20) } },
      options,
    );
  };
}
