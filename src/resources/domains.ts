import type { DomainCheckResponse, PlatformFilter, RequestOptions } from "../types.js";
import { APIResource, enc, nonEmpty, platforms } from "./shared.js";

export interface CheckDomainParams {
  /** e.g. nike.com */
  domain: string;
  /** Platforms to check; omit for all. */
  platform?: PlatformFilter;
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
}
