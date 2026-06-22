import {
  TOKEN_ENDPOINT, JWKS_ENDPOINT, USERINFO_ENDPOINT,
  INTROSPECTION_ENDPOINT, INTROSPECTION_STANDARD_ENDPOINT,
  REVOCATION_ENDPOINT, DISCOVERY_ENDPOINT,
  TOKEN_CREATE_ENDPOINT, TOKEN_LIST_ENDPOINT, TOKEN_UPDATE_ENDPOINT,
  TOKEN_REVOKE_ENDPOINT, TOKEN_DELETE_ENDPOINT, TOKEN_REISSUE_ENDPOINT,
  TOKEN_LOCAL_ENDPOINT,
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

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await fetch('http://localhost:3000/health', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Health check failed with status ${response.status}`);
    return response.json();
  }

  private async postForm(url: string, params: URLSearchParams): Promise<any> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    try { return JSON.parse(text); }
    catch { throw new Error(text || 'Endpoint did not return JSON'); }
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
    const text = await response.text();
    try { return JSON.parse(text); }
    catch { throw new Error(text || 'Endpoint did not return JSON'); }
  }

  private async postAdmin(url: string, body: Record<string, string>, auth: string): Promise<any> {
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
