import type {
  DeliveriesResponse,
  DeliveryResponse,
  DeliveryStatus,
  QueuedResponse,
  RequestOptions,
  WebhookSecretResponse,
} from "../types.js";
import { ValidationError } from "../errors.js";
import { APIResource, intInRange, nonEmpty, oneOf } from "./shared.js";

const STATUSES: readonly DeliveryStatus[] = ["pending", "delivered", "failed"];

export interface ListDeliveriesParams {
  status?: DeliveryStatus;
  cursor?: string;
  /** 1 to 100, default 25. */
  limit?: number;
}

function deliveryId(value: unknown): string {
  const s = nonEmpty("id", value);
  if (!/^\d+$/.test(s)) throw new ValidationError("delivery id must be a positive integer");
  return s;
}

/** Webhook deliveries, test events and the signing secret. To verify signatures see verifyWebhookSignature. */
export class Webhooks extends APIResource {
  /** Your webhook deliveries, newest first, with status, attempts and the receiver's HTTP status. Kept 30 days. Paginated. */
  deliveries = (params: ListDeliveriesParams = {}, options?: RequestOptions): Promise<DeliveriesResponse> =>
    this.client.request(
      {
        path: "/v1/webhooks/deliveries",
        query: {
          status: oneOf("status", params.status, STATUSES),
          cursor: params.cursor,
          limit: intInRange("limit", params.limit, 1, 100),
        },
      },
      options,
    );

  /** One delivery incl. its payload. */
  delivery = (id: number | string, options?: RequestOptions): Promise<DeliveryResponse> =>
    this.client.request({ path: `/v1/webhooks/deliveries/${deliveryId(id)}` }, options);

  /** Queues a delivery again. */
  redeliver = (id: number | string, options?: RequestOptions): Promise<QueuedResponse> =>
    this.client.request({ method: "POST", path: `/v1/webhooks/deliveries/${deliveryId(id)}/redeliver` }, options);

  /**
   * Sends a signed test event (webhook.ping) to a URL, to verify your endpoint and signature check.
   * Slack and Discord webhook URLs get a readable message instead, unsigned.
   */
  test = (url: string, options?: RequestOptions): Promise<QueuedResponse> =>
    this.client.request({ method: "POST", path: "/v1/webhooks/test", body: { url: nonEmpty("url", url) } }, options);

  /** Your webhook signing secret (whsec_...). */
  secret = (options?: RequestOptions): Promise<WebhookSecretResponse> =>
    this.client.request({ path: "/v1/webhooks/secret" }, options);

  /** Rotates the signing secret. The old one stops working immediately. */
  rotateSecret = (options?: RequestOptions): Promise<WebhookSecretResponse> =>
    this.client.request({ method: "POST", path: "/v1/webhooks/secret/rotate" }, options);
}
