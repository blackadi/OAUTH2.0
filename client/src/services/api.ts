import { TOKEN_ENDPOINT, JWKS_ENDPOINT, API_BASE_URL } from '../config';

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
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  async exchangeCodeForToken(tokenRequest: TokenRequest): Promise<TokenResponse> {
    const params = new URLSearchParams(tokenRequest as any);

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Token request failed with status ${response.status}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as TokenResponse;
    } catch {
      throw new Error(text || 'Token endpoint did not return JSON');
    }
  }

  async getJwks(): Promise<JwksResponse> {
    const response = await fetch(JWKS_ENDPOINT, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`JWKS request failed with status ${response.status}`);
    }

    const data = await response.json() as unknown;
    
    // Type guard to ensure the response has the expected structure
    if (!data || typeof data !== 'object' || !('keys' in data) || !Array.isArray(data.keys)) {
      throw new Error('Invalid JWKS response format');
    }
    
    return data as JwksResponse;
  }

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await fetch(`${this.baseUrl}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}`);
    }

    return response.json();
  }
}

export const apiService = new ApiService();
