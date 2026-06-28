export interface ClientCreatePayload {
  client: {
    clientName: string;
    clientType: string;
    applicationType: string;
    grantTypes: string[];
    responseTypes: string[];
    redirectUris: string[];
    tokenAuthMethod: string;
    description: string;
    developer: string;
  };
}

export interface ClientUpdatePayload {
  client: {
    clientName?: string;
    description?: string;
    redirectUris?: string[];
  };
}

export interface DcrRegisterPayload {
  json: string;
}

export interface DcrGetPayload {
  token: string;
  clientId: string;
}

export interface DcrUpdatePayload {
  json: string;
  token: string;
  clientId: string;
}

export interface DcrDeletePayload {
  token: string;
  clientId: string;
}
