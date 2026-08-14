import { Authlete } from "@authlete/typescript-sdk";
import { Client } from "@authlete/typescript-sdk/models";
import { authleteConfig as defaultConfig } from "../config/authlete.config";
import { authleteApi as defaultApi } from "./authlete.service";

/**
 * Read `backchannelLogoutUri` off a listed client.
 *
 * **SDK 1.0.0's `Client` model does not have this field**, and finding that out is what BCL-W6 cost.
 * It carries **104** of Authlete 3.0.16's **108** `Client` properties; the four it omits are
 * `backchannelLogoutUri`, `backchannelLogoutSessionRequired`, `spiffeId` and `spiffeBundleEndpoint`.
 *
 * **The data is not lost, and the difference from `Service` is the part to remember.**
 * `Service$inboundSchema` is a plain `z.object` and *strips* what it does not model — that is the
 * asymmetry `AGENTS.md` records. `Client$inboundSchema` is **not**: it wraps itself in the SDK's
 * `collectExtraKeys$`, so unmodelled members arrive under `client.additionalProperties` instead of
 * disappearing. Verified by parsing a fixture through `Client$inboundSchema` and reading where the
 * field landed, not inferred from the model's shape.
 *
 * That distinction decides whether this function can exist. The raw `fetch()` this replaced read the
 * field straight off the wire; had `Client` behaved like `Service`, moving to the SDK would have made
 * `issueAndDeliverToAll` deliver to **nobody**, silently, while still answering 200.
 */
function backchannelLogoutUriOf(client: Client): string | undefined {
  const value = client.additionalProperties?.backchannelLogoutUri;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export interface BackchannelLogoutTokenResponse {
  resultCode?: string;
  resultMessage?: string;
  action: "OK" | "SERVER_ERROR" | "CALLER_ERROR";
  logoutToken?: string;
  backchannelLogoutUri?: string;
}

export interface DeliveryResult {
  clientId: string;
  clientName?: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  backchannelLogoutUri?: string;
}

export class BackchannelLogoutService {
  constructor(
    private config: { baseUrl: string; serviceId: string; AccessToken: string } = defaultConfig,
    private authleteApi: Authlete = defaultApi,
  ) {}

  // The one raw `fetch()` to Authlete this repo keeps, and the reason is narrow: SDK 1.0.0 exposes no
  // backchannel logout token API — re-verified against 1.0.0. Everything else in this file goes through
  // the SDK. `issueAndDeliverToAll` used to hand-roll `/client/get/list` here too (BCL-W6), which made
  // the exception look like a pattern and left a second URL, a second auth header and a second
  // hand-written response shape to keep in step with the vendor.
  private async callAuthleteIssueToken(
    clientIdentifier: string,
    subject?: string,
    sessionId?: string,
  ): Promise<BackchannelLogoutTokenResponse> {
    const url = `${this.config.baseUrl}/api/${this.config.serviceId}/backchannel/logout/token`;

    const body: Record<string, string> = { clientIdentifier };
    if (subject) body.subject = subject;
    if (sessionId) body.sessionId = sessionId;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.AccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        action: "SERVER_ERROR",
        resultCode: String(res.status),
        resultMessage: text || `HTTP ${res.status} from Authlete`,
      };
    }

    const data = await res.json() as BackchannelLogoutTokenResponse;
    return data;
  }

  async issueToken(
    clientIdentifier: string,
    subject?: string,
    sessionId?: string,
  ): Promise<BackchannelLogoutTokenResponse> {
    return this.callAuthleteIssueToken(clientIdentifier, subject, sessionId);
  }

  async issueAndDeliver(
    clientIdentifier: string,
    subject?: string,
    sessionId?: string,
  ): Promise<DeliveryResult> {
    const tokenRes = await this.callAuthleteIssueToken(clientIdentifier, subject, sessionId);

    if (tokenRes.action !== "OK" || !tokenRes.logoutToken) {
      return {
        clientId: clientIdentifier,
        success: false,
        error: tokenRes.resultMessage || `Authlete action: ${tokenRes.action}`,
      };
    }

    const targetUri = tokenRes.backchannelLogoutUri;
    if (!targetUri) {
      return {
        clientId: clientIdentifier,
        success: false,
        error: "Client has no backchannelLogoutUri configured",
        backchannelLogoutUri: targetUri,
      };
    }

    try {
      const deliveryRes = await fetch(targetUri, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ logout_token: tokenRes.logoutToken }).toString(),
      });

      return {
        clientId: clientIdentifier,
        success: deliveryRes.ok,
        statusCode: deliveryRes.status,
        backchannelLogoutUri: targetUri,
      };
    } catch (err) {
      return {
        clientId: clientIdentifier,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        backchannelLogoutUri: targetUri,
      };
    }
  }

  async issueAndDeliverToAll(
    subject?: string,
    sessionId?: string,
  ): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];
    const delivered = new Set<string>();

    let start = 0;
    const pageSize = 100;
    let end = pageSize;
    let hasMore = true;

    while (hasMore) {
      // BCL-W6: `authleteApi.client.list`, not a second hand-written `fetch()` to the same vendor. The
      // duplicate carried its own URL, its own bearer header and its own guess at the response shape.
      // See `backchannelLogoutUriOf` for the one field that guess got right and the SDK's model does
      // not have.
      let listData;
      try {
        listData = await this.authleteApi.client.list({
          serviceId: this.config.serviceId,
          start,
          end,
        });
      } catch (err) {
        // Kept as a batch-level result rather than a throw: the caller is delivering logout tokens to
        // every RP, and it needs to see which ones were reached, not just that the sweep failed.
        results.push({
          clientId: "batch",
          success: false,
          error: `Failed to list clients: ${err instanceof Error ? err.message : String(err)}`,
        });
        return results;
      }

      const clients = listData.clients || [];
      for (const client of clients) {
        // A filter, not the delivery target: the URI actually posted to comes back from Authlete on
        // the logout-token call. This only decides which clients are worth asking about.
        if (!backchannelLogoutUriOf(client)) continue;

        const identifier = client.clientIdAlias || String(client.clientId);
        if (delivered.has(identifier)) continue;
        delivered.add(identifier);

        const result = await this.issueAndDeliver(identifier, subject, sessionId);
        result.clientName = client.clientName;
        results.push(result);
      }

      start = end;
      end += pageSize;
      if (start >= (listData.totalCount || 0)) {
        hasMore = false;
      }
    }

    return results;
  }
}
