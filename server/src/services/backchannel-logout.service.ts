import { authleteConfig } from "../config/authlete.config";

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
  private async callAuthleteIssueToken(
    clientIdentifier: string,
    subject?: string,
    sessionId?: string,
  ): Promise<BackchannelLogoutTokenResponse> {
    const url = `${authleteConfig.baseUrl}/api/${authleteConfig.serviceId}/backchannel/logout/token`;

    const body: Record<string, string> = { clientIdentifier };
    if (subject) body.subject = subject;
    if (sessionId) body.sessionId = sessionId;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authleteConfig.AccessToken}`,
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

    let start = 0;
    const end = 100;
    let hasMore = true;

    while (hasMore) {
      const listUrl = `${authleteConfig.baseUrl}/api/${authleteConfig.serviceId}/client/get/list?start=${start}&end=${end}`;
      const listRes = await fetch(listUrl, {
        headers: {
          Authorization: `Bearer ${authleteConfig.AccessToken}`,
        },
      });

      if (!listRes.ok) {
        results.push({
          clientId: "batch",
          success: false,
          error: `Failed to list clients: HTTP ${listRes.status}`,
        });
        return results;
      }

      const listData = await listRes.json() as {
        clients?: Array<{
          clientId?: number;
          clientName?: string;
          backchannelLogoutUri?: string;
          clientIdAlias?: string;
        }>;
        totalCount?: number;
      };

      const clients = listData.clients || [];
      for (const client of clients) {
        if (!client.backchannelLogoutUri) continue;

        const identifier = client.clientIdAlias || String(client.clientId);
        const result = await this.issueAndDeliver(identifier, subject, sessionId);
        result.clientName = client.clientName;
        results.push(result);
      }

      start = end;
      if (start >= (listData.totalCount || 0)) {
        hasMore = false;
      }
    }

    return results;
  }
}
