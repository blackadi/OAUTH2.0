import {
  TOKEN_ENDPOINT, JWKS_ENDPOINT, USERINFO_ENDPOINT,
  INTROSPECTION_ENDPOINT, INTROSPECTION_STANDARD_ENDPOINT,
  REVOCATION_ENDPOINT, DISCOVERY_ENDPOINT,
  TOKEN_CREATE_ENDPOINT, TOKEN_LIST_ENDPOINT, TOKEN_UPDATE_ENDPOINT,
  TOKEN_REVOKE_ENDPOINT, TOKEN_DELETE_ENDPOINT, TOKEN_REISSUE_ENDPOINT,
  TOKEN_LOCAL_ENDPOINT,
  CLIENT_LIST_ENDPOINT, CLIENT_GET_ENDPOINT, CLIENT_CREATE_ENDPOINT,
  CLIENT_UPDATE_ENDPOINT, CLIENT_DELETE_ENDPOINT, CLIENT_FLAG_ENDPOINT,
  CLIENT_SECRET_REFRESH_ENDPOINT, CLIENT_SECRET_UPDATE_ENDPOINT,
  CLIENT_AUTH_LIST_ENDPOINT, CLIENT_AUTH_UPDATE_ENDPOINT, CLIENT_AUTH_DELETE_ENDPOINT,
  CLIENT_SCOPES_GRANTED_ENDPOINT, CLIENT_SCOPES_REQUESTABLE_ENDPOINT,
  GRANT_MANAGEMENT_ENDPOINT,
  BACKCHANNEL_LOGOUT_ISSUE_ENDPOINT,
  BACKCHANNEL_LOGOUT_DELIVER_ENDPOINT,
  BACKCHANNEL_LOGOUT_DELIVER_ALL_ENDPOINT,
  DCR_REGISTER_ENDPOINT,
  DCR_GET_ENDPOINT,
  DCR_UPDATE_ENDPOINT,
  DCR_DELETE_ENDPOINT,
  CIBA_AUTHENTICATION_ENDPOINT,
  CIBA_ISSUE_ENDPOINT,
  CIBA_FAIL_ENDPOINT,
  CIBA_COMPLETE_ENDPOINT,
  PAR_ENDPOINT,
  DEVICE_AUTHORIZATION_ENDPOINT,
  DEVICE_VERIFICATION_ENDPOINT,
  DEVICE_COMPLETE_ENDPOINT,
  HEALTH_ENDPOINT,
  HEALTH_AUTHLETE_ENDPOINT,
} from '../config';

export interface TokenRequest {
  grant_type: string;
  code: string;
  redirect_uri: string;
  client_id: string;
  code_verifier: string;
}

export interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  [key: string]: unknown;
}

export interface JwksResponse {
  keys: Array<{
    kty: string;
    kid?: string;
    use?: string;
    alg?: string;
    n?: string;
    e?: string;
    x5t?: string;
    x5c?: string[];
  }>;
}

class ApiService {
  async exchangeCodeForToken(tokenRequest: TokenRequest): Promise<TokenResponse> {
    const params = new URLSearchParams(tokenRequest as any);
    return this.postForm(TOKEN_ENDPOINT, params);
  }

  async clientCredentials(clientId: string, clientSecret: string, scope: string): Promise<TokenResponse> {
    const params = new URLSearchParams({ grant_type: 'client_credentials', scope });
    return this.postBasicAuth(TOKEN_ENDPOINT, params, clientId, clientSecret);
  }

  async passwordGrant(username: string, password: string, clientId: string, clientSecret: string, scope: string): Promise<TokenResponse> {
    const params = new URLSearchParams({ grant_type: 'password', username, password, scope });
    return this.postBasicAuth(TOKEN_ENDPOINT, params, clientId, clientSecret);
  }

  async refreshToken(refreshToken: string, clientId: string, clientSecret: string): Promise<TokenResponse> {
    const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
    return this.postBasicAuth(TOKEN_ENDPOINT, params, clientId, clientSecret);
  }

  async userInfo(accessToken: string): Promise<any> {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async introspection(token: string, accessToken?: string): Promise<any> {
    const params = new URLSearchParams({ token });
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    const response = await fetch(INTROSPECTION_ENDPOINT, { method: 'POST', headers, body: params.toString() });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async introspectionStandard(token: string): Promise<any> {
    return this.postForm(INTROSPECTION_STANDARD_ENDPOINT, new URLSearchParams({ token }));
  }

  async revocation(token: string, clientId?: string, clientSecret?: string, tokenTypeHint?: string): Promise<void> {
    const params = new URLSearchParams({ token });
    if (tokenTypeHint) {
      params.append('token_type_hint', tokenTypeHint);
    }
    if (clientId && clientSecret) {
      const response = await fetch(REVOCATION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: params.toString(),
      });
      if (!response.ok) throw new Error(await response.text());
    } else {
      await this.postForm(REVOCATION_ENDPOINT, params);
    }
  }

  async adminCreate(body: Record<string, string>, auth: string): Promise<any> {
    return this.postAdmin(TOKEN_CREATE_ENDPOINT, body, auth);
  }

  async adminList(auth: string): Promise<any> {
    const response = await fetch(TOKEN_LIST_ENDPOINT, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async adminUpdate(body: Record<string, string>, auth: string): Promise<any> {
    const response = await fetch(TOKEN_UPDATE_ENDPOINT, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async adminRevoke(body: Record<string, string>, auth: string): Promise<any> {
    return this.postAdmin(TOKEN_REVOKE_ENDPOINT, body, auth);
  }

  async adminDelete(accessTokenIdentifier: string, auth: string): Promise<void> {
    const response = await fetch(`${TOKEN_DELETE_ENDPOINT}/${encodeURIComponent(accessTokenIdentifier)}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!response.ok) throw new Error(await response.text());
  }

  async adminReissue(body: Record<string, string>, auth: string): Promise<any> {
    return this.postAdmin(TOKEN_REISSUE_ENDPOINT, body, auth);
  }

  async adminLocalToken(params: Record<string, string>): Promise<any> {
    const qs = new URLSearchParams(params).toString();
    const response = await fetch(`${TOKEN_LOCAL_ENDPOINT}?${qs}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async discovery(): Promise<any> {
    const response = await fetch(DISCOVERY_ENDPOINT, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async getJwks(): Promise<JwksResponse> {
    const response = await fetch(JWKS_ENDPOINT, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`JWKS request failed with status ${response.status}`);
    const data = await response.json() as unknown;
    if (!data || typeof data !== 'object' || !('keys' in data) || !Array.isArray(data.keys)) {
      throw new Error('Invalid JWKS response format');
    }
    return data as JwksResponse;
  }

  async clientList(auth: string, start?: number, end?: number): Promise<any> {
    let url = CLIENT_LIST_ENDPOINT;
    const params = new URLSearchParams();
    if (start !== undefined) params.set('start', String(start));
    if (end !== undefined) params.set('end', String(end));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientGet(clientId: string, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_GET_ENDPOINT}/${encodeURIComponent(clientId)}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientCreate(body: Record<string, unknown>, auth: string): Promise<any> {
    return this.postAdmin(CLIENT_CREATE_ENDPOINT, body, auth);
  }

  async clientUpdate(clientId: string, body: Record<string, unknown>, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_UPDATE_ENDPOINT}/${encodeURIComponent(clientId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientDelete(clientId: string, auth: string): Promise<void> {
    const response = await fetch(`${CLIENT_DELETE_ENDPOINT}/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!response.ok) throw new Error(await response.text());
  }

  async clientLockFlag(clientIdentifier: string, locked: boolean, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_FLAG_ENDPOINT}/${encodeURIComponent(clientIdentifier)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ clientLocked: locked }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientRefreshSecret(clientIdentifier: string, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_SECRET_REFRESH_ENDPOINT}/${encodeURIComponent(clientIdentifier)}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientListAuth(subject: string, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_AUTH_LIST_ENDPOINT}/${encodeURIComponent(subject)}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientUpdateAuth(clientId: string, body: Record<string, unknown>, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_AUTH_UPDATE_ENDPOINT}/${encodeURIComponent(clientId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientDeleteAuth(clientId: string, subject: string, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_AUTH_DELETE_ENDPOINT}/${encodeURIComponent(clientId)}/${encodeURIComponent(subject)}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientGetGrantedScopes(clientId: string, subject: string, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_SCOPES_GRANTED_ENDPOINT}/${encodeURIComponent(clientId)}/${encodeURIComponent(subject)}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientDeleteGrantedScopes(clientId: string, subject: string, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_SCOPES_GRANTED_ENDPOINT}/${encodeURIComponent(clientId)}/${encodeURIComponent(subject)}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientGetRequestableScopes(clientId: string, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_SCOPES_REQUESTABLE_ENDPOINT}/${encodeURIComponent(clientId)}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientUpdateRequestableScopes(clientId: string, body: Record<string, unknown>, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_SCOPES_REQUESTABLE_ENDPOINT}/${encodeURIComponent(clientId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async clientDeleteRequestableScopes(clientId: string, auth: string): Promise<void> {
    const response = await fetch(`${CLIENT_SCOPES_REQUESTABLE_ENDPOINT}/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!response.ok) throw new Error(await response.text());
  }

  async clientUpdateSecret(clientIdentifier: string, clientSecret: string, auth: string): Promise<any> {
    const response = await fetch(`${CLIENT_SECRET_UPDATE_ENDPOINT}/${encodeURIComponent(clientIdentifier)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ clientSecret }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async backchannelLogoutIssue(body: Record<string, string>, auth: string): Promise<any> {
    return this.postAdmin(BACKCHANNEL_LOGOUT_ISSUE_ENDPOINT, body, auth);
  }

  async backchannelLogoutDeliver(body: Record<string, string>, auth: string): Promise<any> {
    return this.postAdmin(BACKCHANNEL_LOGOUT_DELIVER_ENDPOINT, body, auth);
  }

  async backchannelLogoutDeliverAll(body: Record<string, string>, auth: string): Promise<any> {
    return this.postAdmin(BACKCHANNEL_LOGOUT_DELIVER_ALL_ENDPOINT, body, auth);
  }

  async queryGrant(accessToken: string, grantId: string): Promise<any> {
    const response = await fetch(`${GRANT_MANAGEMENT_ENDPOINT}/${encodeURIComponent(grantId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async revokeGrant(accessToken: string, grantId: string): Promise<any> {
    const response = await fetch(`${GRANT_MANAGEMENT_ENDPOINT}/${encodeURIComponent(grantId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async dcrRegister(body: Record<string, string>, auth: string): Promise<any> {
    return this.postAdmin(DCR_REGISTER_ENDPOINT, body, auth);
  }

  async dcrGet(token: string, clientId: string): Promise<any> {
    const response = await fetch(DCR_GET_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, clientId }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async dcrUpdate(json: string, token: string, clientId: string): Promise<any> {
    const response = await fetch(DCR_UPDATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json, token, clientId }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async dcrDelete(token: string, clientId: string): Promise<any> {
    const response = await fetch(DCR_DELETE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, clientId }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async authleteHealth(extended: boolean): Promise<any> {
    const url = extended ? `${HEALTH_AUTHLETE_ENDPOINT}?extended=true` : HEALTH_AUTHLETE_ENDPOINT;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async healthCheck(): Promise<{ status: string; uptime: number; timestamp: string }> {
    const response = await fetch(HEALTH_ENDPOINT, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Health check failed with status ${response.status}`);
    return response.json();
  }

  async cibaBackchannelAuthentication(body: Record<string, string>): Promise<any> {
    const response = await fetch(CIBA_AUTHENTICATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async cibaIssue(ticket: string): Promise<any> {
    const response = await fetch(CIBA_ISSUE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { return text; }
  }

  async cibaFail(ticket: string, reason: string): Promise<any> {
    const response = await fetch(CIBA_FAIL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, reason }),
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { return text; }
  }

  async cibaComplete(ticket: string, result: string, subject: string): Promise<any> {
    const response = await fetch(CIBA_COMPLETE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, result, subject }),
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { return text; }
  }

  async pushedAuthorization(body: Record<string, string>): Promise<any> {
    const response = await fetch(PAR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { return text; }
  }

  async deviceAuthorization(body: Record<string, string>): Promise<any> {
    const response = await fetch(DEVICE_AUTHORIZATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { return text; }
  }

  async deviceVerification(userCode: string): Promise<any> {
    const response = await fetch(DEVICE_VERIFICATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCode }),
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { return text; }
  }

  async deviceComplete(userCode: string, result: string, subject: string): Promise<any> {
    const response = await fetch(DEVICE_COMPLETE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCode, result, subject }),
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { return text; }
  }

  private async postForm(url: string, params: URLSearchParams): Promise<any> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  private async postBasicAuth(url: string, params: URLSearchParams, clientId: string, clientSecret: string): Promise<any> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: params.toString(),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  private async postAdmin(url: string, body: Record<string, unknown>, auth: string): Promise<any> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }
}

export const apiService = new ApiService();
