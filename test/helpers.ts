import { AdLib, type ClientOptions } from "../src/index.js";

export interface RecordedCall {
  url: URL;
  headers: Record<string, string>;
  method: string | undefined;
  /** Request body as sent (a JSON string for POST). */
  body: string | undefined;
}

type Responder = Response | Error | ((call: RecordedCall) => Response | Promise<Response>);

/** A fetch stand-in that records calls and replays queued responses (the last one repeats). */
export function mockFetch(...responses: Responder[]) {
  const calls: RecordedCall[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const call: RecordedCall = {
      url: new URL(String(input)),
      headers,
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    const r = responses.length > 1 ? responses.shift()! : responses[0] ?? json({});
    if (r instanceof Error) throw r;
    if (typeof r === "function") return r(call);
    return r.clone();
  };
  return { fetch: fn as typeof fetch, calls };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function apiError(status: number, code: string, message = "boom", headers: Record<string, string> = {}): Response {
  return json({ error: { code, message, request_id: "req-1", billed: false } }, status, headers);
}

export function makeClient(responses: Responder[] = [json({ ok: true })], options: ClientOptions = {}) {
  const mock = mockFetch(...responses);
  const client = new AdLib({ apiKey: "test-key", retryDelayMs: 0, fetch: mock.fetch, ...options });
  return { client, calls: mock.calls };
}

export function adPage(ids: string[], next: string | null) {
  return {
    data: ids.map((id) => ({ id })),
    next_cursor: next,
    meta: { count: ids.length, cached: false, source: "live" },
  };
}
