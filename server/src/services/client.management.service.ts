import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";
import {
  ClientGetListResponse,
  ClientSecretRefreshResponse,
  ClientSecretUpdateResponse,
  ClientFlagUpdateResponse,
  ClientInput,
  ClientAuthorizationGetListResponse,
  ClientAuthorizationUpdateResponse,
  ClientAuthorizationDeleteResponse,
  ClientGrantedScopesDeleteResponse,
  ClientExtensionRequestableScopesGetResponse,
  ClientExtensionRequestableScopesUpdateResponse,
} from "@authlete/typescript-sdk/models";

export class ClientManagementService {
  constructor(private authleteApi: Authlete = defaultApi) {}
  async list(req: Request): Promise<ClientGetListResponse> {
    const log = req.logger || logger;
    const body = req.body as Record<string, unknown> | undefined;
    const query = req.query as Record<string, string>;

    const start = Number(body?.start ?? query.start ?? 0);
    const end = Number(body?.end ?? query.end ?? 20);
    const developer = (body?.developer as string) || (query.developer as string) || undefined;

    log("ClientListService: calling Authlete client list endpoint", { start, end, developer });

    const response = await this.authleteApi.client.list({
      serviceId,
      start,
      end,
      developer,
    });

    return response;
  }

  async get(req: Request): Promise<any> {
    const log = req.logger || logger;
    const clientId = String(req.params.clientId);

    if (!clientId) {
      throw new AppError("", 400);
    }

    log("ClientGetService: calling Authlete client get endpoint", { clientId });

    const response = await this.authleteApi.client.get({
      serviceId,
      clientId,
    });

    return response;
  }

  async create(req: Request): Promise<any> {
    const log = req.logger || logger;
    const body = req.body as Record<string, unknown>;
    const clientPayload = body.client as Record<string, unknown> | undefined;

    if (!clientPayload || Object.keys(clientPayload).length === 0) {
      throw new AppError("", 400);
    }

    const clientInput: ClientInput = this.buildClientInput(clientPayload);

    log("ClientCreateService: calling Authlete client create endpoint", {
      clientName: clientInput.clientName,
      grantTypes: clientInput.grantTypes,
    });

    const response = await this.authleteApi.client.create({
      serviceId,
      client: clientInput,
    });

    return response;
  }

  async update(req: Request): Promise<any> {
    const log = req.logger || logger;
    const clientId = String(req.params.clientId);
    const body = req.body as Record<string, unknown>;
    const clientPayload = body.client as Record<string, unknown> | undefined;

    if (!clientId) {
      throw new AppError("", 400);
    }

    const clientInput: ClientInput = this.buildClientInput(clientPayload || body);

    log("ClientUpdateService: calling Authlete client update endpoint", { clientId });

    const response = await this.authleteApi.client.update({
      serviceId,
      clientId,
      client: clientInput,
    });

    return response;
  }

  async delete(req: Request): Promise<void> {
    const log = req.logger || logger;
    const clientId = String(req.params.clientId);

    if (!clientId) {
      throw new AppError("", 400);
    }

    log("ClientDeleteService: calling Authlete client delete endpoint", { clientId });

    const response = await this.authleteApi.client.delete({
      serviceId,
      clientId,
    });

    return response;
  }

  async updateLockFlag(req: Request): Promise<ClientFlagUpdateResponse> {
    const log = req.logger || logger;
    const clientIdentifier = String(req.params.clientIdentifier);
    const body = req.body as Record<string, unknown>;

    if (!clientIdentifier) {
      throw new AppError("", 400);
    }

    const clientLocked = body.clientLocked === true || body.clientLocked === "true";

    log("ClientLockFlagService: calling Authlete client lock flag update endpoint", {
      clientIdentifier,
      clientLocked,
    });

    const response = await this.authleteApi.client.management.updateLockFlag({
      serviceId,
      clientIdentifier,
      clientFlagUpdateRequest: { clientLocked },
    });

    return response;
  }

  async refreshSecret(req: Request): Promise<ClientSecretRefreshResponse> {
    const log = req.logger || logger;
    const clientIdentifier = String(req.params.clientIdentifier);

    if (!clientIdentifier) {
      throw new AppError("", 400);
    }

    log("ClientSecretRefreshService: calling Authlete client secret refresh endpoint", {
      clientIdentifier,
    });

    const response = await this.authleteApi.client.management.refreshSecret({
      serviceId,
      clientIdentifier,
    });

    return response;
  }

  async updateSecret(req: Request): Promise<ClientSecretUpdateResponse> {
    const log = req.logger || logger;
    const clientIdentifier = String(req.params.clientIdentifier);
    const body = req.body as Record<string, unknown>;
    const clientSecret = body.clientSecret as string;

    if (!clientIdentifier) {
      throw new AppError("", 400);
    }

    if (!clientSecret) {
      throw new AppError("", 400);
    }

    log("ClientSecretUpdateService: calling Authlete client secret update endpoint", {
      clientIdentifier,
    });

    const response = await this.authleteApi.client.management.updateSecret({
      serviceId,
      clientIdentifier,
      clientSecretUpdateRequest: { clientSecret },
    });

    return response;
  }

  async listAuthorizations(req: Request): Promise<ClientAuthorizationGetListResponse> {
    const log = req.logger || logger;
    const subject = String(req.params.subject);
    const body = req.body as Record<string, unknown> | undefined;
    const query = req.query as Record<string, string>;

    const developer = (body?.developer as string) || (query.developer as string) || undefined;
    const start = Number(body?.start ?? query.start ?? 0);
    const end = Number(body?.end ?? query.end ?? 5);

    if (!subject) {
      throw new AppError("", 400);
    }

    log("ClientListAuthorizationsService: calling Authlete", { subject, start, end });

    const response = await this.authleteApi.client.management.listAuthorizations({
      serviceId,
      subjectPathParameter: subject,
      subjectQueryParameter: subject,
      developer,
      start,
      end,
    });

    return response;
  }

  async updateAuthorizations(req: Request): Promise<ClientAuthorizationUpdateResponse> {
    const log = req.logger || logger;
    const clientId = String(req.params.clientId);
    const body = req.body as Record<string, unknown>;
    const subject = body.subject as string;
    const scopes = body.scopes as string | string[] | undefined;

    if (!clientId) {
      throw new AppError("", 400);
    }
    if (!subject) {
      throw new AppError("", 400);
    }

    const scopeArray = Array.isArray(scopes)
      ? scopes
      : typeof scopes === "string"
        ? scopes.split(/[\s,]+/).filter(Boolean)
        : undefined;

    log("ClientUpdateAuthorizationsService: calling Authlete", { clientId, subject });

    const response = await this.authleteApi.client.management.updateAuthorizations({
      serviceId,
      clientId,
      clientAuthorizationUpdateRequest: { subject, scopes: scopeArray },
    });

    return response;
  }

  async deleteAuthorizations(req: Request): Promise<ClientAuthorizationDeleteResponse> {
    const log = req.logger || logger;
    const clientId = String(req.params.clientId);
    const subject = String(req.params.subject);

    if (!clientId) {
      throw new AppError("", 400);
    }
    if (!subject) {
      throw new AppError("", 400);
    }

    log("ClientDeleteAuthorizationsService: calling Authlete", { clientId, subject });

    const response = await this.authleteApi.client.management.deleteAuthorizations({
      serviceId,
      clientId,
      subjectPathParameter: subject,
      subjectQueryParameter: subject,
    });

    return response;
  }

  async getGrantedScopes(req: Request): Promise<ClientAuthorizationDeleteResponse> {
    const log = req.logger || logger;
    const clientId = String(req.params.clientId);
    const subject = String(req.params.subject);

    if (!clientId) {
      throw new AppError("", 400);
    }
    if (!subject) {
      throw new AppError("", 400);
    }

    log("ClientGetGrantedScopesService: calling Authlete", { clientId, subject });

    const response = await this.authleteApi.client.management.getGrantedScopes({
      serviceId,
      clientId,
      subjectPathParameter: subject,
      subjectQueryParameter: subject,
    });

    return response;
  }

  async deleteGrantedScopes(req: Request): Promise<ClientGrantedScopesDeleteResponse> {
    const log = req.logger || logger;
    const clientId = String(req.params.clientId);
    const subject = String(req.params.subject);

    if (!clientId) {
      throw new AppError("", 400);
    }
    if (!subject) {
      throw new AppError("", 400);
    }

    log("ClientDeleteGrantedScopesService: calling Authlete", { clientId, subject });

    const response = await this.authleteApi.client.management.deleteGrantedScopes({
      serviceId,
      clientId,
      subjectPathParameter: subject,
      subjectQueryParameter: subject,
    });

    return response;
  }

  async getRequestableScopes(req: Request): Promise<ClientExtensionRequestableScopesGetResponse> {
    const log = req.logger || logger;
    const clientId = String(req.params.clientId);

    if (!clientId) {
      throw new AppError("", 400);
    }

    log("ClientGetRequestableScopesService: calling Authlete", { clientId });

    const response = await this.authleteApi.client.management.getRequestableScopes({
      serviceId,
      clientId,
    });

    return response;
  }

  async updateRequestableScopes(req: Request): Promise<ClientExtensionRequestableScopesUpdateResponse> {
    const log = req.logger || logger;
    const clientId = String(req.params.clientId);
    const body = req.body as Record<string, unknown>;
    const scopes = body.requestableScopes as string | string[] | undefined;

    if (!clientId) {
      throw new AppError("", 400);
    }

    const scopeArray = Array.isArray(scopes)
      ? scopes
      : typeof scopes === "string"
        ? scopes.split(/[\s,]+/).filter(Boolean)
        : undefined;

    log("ClientUpdateRequestableScopesService: calling Authlete", { clientId });

    const response = await this.authleteApi.client.management.updateRequestableScopes({
      serviceId,
      clientId,
      clientExtensionRequestableScopesUpdateRequest: { requestableScopes: scopeArray },
    });

    return response;
  }

  async deleteRequestableScopes(req: Request): Promise<void> {
    const log = req.logger || logger;
    const clientId = String(req.params.clientId);

    if (!clientId) {
      throw new AppError("", 400);
    }

    log("ClientDeleteRequestableScopesService: calling Authlete", { clientId });

    const response = await this.authleteApi.client.management.deleteRequestableScopes({
      serviceId,
      clientId,
    });

    return response;
  }

  private buildClientInput(payload: Record<string, unknown>): ClientInput {
    const input: ClientInput = {};

    if (payload.clientName !== undefined) input.clientName = String(payload.clientName);
    if (payload.description !== undefined) input.description = String(payload.description);
    if (payload.clientIdAlias !== undefined) input.clientIdAlias = String(payload.clientIdAlias);
    if (payload.clientType !== undefined) input.clientType = String(payload.clientType) as any;
    if (payload.applicationType !== undefined) input.applicationType = String(payload.applicationType) as any;
    if (payload.developer !== undefined) input.developer = String(payload.developer);
    if (payload.logoUri !== undefined) input.logoUri = String(payload.logoUri);
    if (payload.clientUri !== undefined) input.clientUri = String(payload.clientUri);
    if (payload.policyUri !== undefined) input.policyUri = String(payload.policyUri);
    if (payload.tosUri !== undefined) input.tosUri = String(payload.tosUri);
    if (payload.jwksUri !== undefined) input.jwksUri = String(payload.jwksUri);
    if (payload.jwks !== undefined) input.jwks = String(payload.jwks);
    if (payload.sectorIdentifierUri !== undefined) input.sectorIdentifierUri = String(payload.sectorIdentifierUri);
    if (payload.subjectType !== undefined) input.subjectType = String(payload.subjectType) as any;
    if (payload.tokenAuthMethod !== undefined) input.tokenAuthMethod = String(payload.tokenAuthMethod) as any;
    if (payload.tokenAuthSignAlg !== undefined) input.tokenAuthSignAlg = String(payload.tokenAuthSignAlg) as any;
    if (payload.idTokenSignAlg !== undefined) input.idTokenSignAlg = String(payload.idTokenSignAlg) as any;
    if (payload.idTokenEncryptionAlg !== undefined) input.idTokenEncryptionAlg = String(payload.idTokenEncryptionAlg) as any;
    if (payload.idTokenEncryptionEnc !== undefined) input.idTokenEncryptionEnc = String(payload.idTokenEncryptionEnc) as any;
    if (payload.userInfoSignAlg !== undefined) input.userInfoSignAlg = String(payload.userInfoSignAlg) as any;
    if (payload.userInfoEncryptionAlg !== undefined) input.userInfoEncryptionAlg = String(payload.userInfoEncryptionAlg) as any;
    if (payload.userInfoEncryptionEnc !== undefined) input.userInfoEncryptionEnc = String(payload.userInfoEncryptionEnc) as any;
    if (payload.authorizationSignAlg !== undefined) input.authorizationSignAlg = String(payload.authorizationSignAlg) as any;
    if (payload.authorizationEncryptionAlg !== undefined) input.authorizationEncryptionAlg = String(payload.authorizationEncryptionAlg) as any;
    if (payload.authorizationEncryptionEnc !== undefined) input.authorizationEncryptionEnc = String(payload.authorizationEncryptionEnc) as any;
    if (payload.requestSignAlg !== undefined) input.requestSignAlg = String(payload.requestSignAlg) as any;
    if (payload.requestEncryptionAlg !== undefined) input.requestEncryptionAlg = String(payload.requestEncryptionAlg) as any;
    if (payload.requestEncryptionEnc !== undefined) input.requestEncryptionEnc = String(payload.requestEncryptionEnc) as any;
    if (payload.defaultMaxAge !== undefined) input.defaultMaxAge = Number(payload.defaultMaxAge);
    if (payload.authTimeRequired !== undefined) input.authTimeRequired = Boolean(payload.authTimeRequired);
    if (payload.parRequired !== undefined) input.parRequired = Boolean(payload.parRequired);
    if (payload.requestObjectRequired !== undefined) input.requestObjectRequired = Boolean(payload.requestObjectRequired);
    if (payload.pkceRequired !== undefined) input.pkceRequired = Boolean(payload.pkceRequired);
    if (payload.pkceS256Required !== undefined) input.pkceS256Required = Boolean(payload.pkceS256Required);
    if (payload.dpopRequired !== undefined) input.dpopRequired = Boolean(payload.dpopRequired);
    if (payload.tlsClientCertificateBoundAccessTokens !== undefined) input.tlsClientCertificateBoundAccessTokens = Boolean(payload.tlsClientCertificateBoundAccessTokens);
    if (payload.singleAccessTokenPerSubject !== undefined) input.singleAccessTokenPerSubject = Boolean(payload.singleAccessTokenPerSubject);
    if (payload.softwareId !== undefined) input.softwareId = String(payload.softwareId);
    if (payload.softwareVersion !== undefined) input.softwareVersion = String(payload.softwareVersion);
    if (payload.customMetadata !== undefined) input.customMetadata = String(payload.customMetadata);

    // Grant types — accept array or comma/space-separated string
    if (payload.grantTypes !== undefined) {
      input.grantTypes = (Array.isArray(payload.grantTypes)
        ? (payload.grantTypes as string[])
        : String(payload.grantTypes).split(/[\s,]+/).filter(Boolean)) as any;
    }

    // Response types
    if (payload.responseTypes !== undefined) {
      input.responseTypes = (Array.isArray(payload.responseTypes)
        ? (payload.responseTypes as string[])
        : String(payload.responseTypes).split(/[\s,]+/).filter(Boolean)) as any;
    }

    // Redirect URIs
    if (payload.redirectUris !== undefined) {
      input.redirectUris = Array.isArray(payload.redirectUris)
        ? (payload.redirectUris as string[])
        : String(payload.redirectUris).split(/[\s,]+/).filter(Boolean);
    }

    // Request URIs
    if (payload.requestUris !== undefined) {
      input.requestUris = Array.isArray(payload.requestUris)
        ? (payload.requestUris as string[])
        : String(payload.requestUris).split(/[\s,]+/).filter(Boolean);
    }

    // Contacts
    if (payload.contacts !== undefined) {
      input.contacts = Array.isArray(payload.contacts)
        ? (payload.contacts as string[])
        : String(payload.contacts).split(/[\s,]+/).filter(Boolean);
    }

    // Default ACRs
    if (payload.defaultAcrs !== undefined) {
      input.defaultAcrs = Array.isArray(payload.defaultAcrs)
        ? (payload.defaultAcrs as string[])
        : String(payload.defaultAcrs).split(/[\s,]+/).filter(Boolean);
    }

    // Authorization details types
    if (payload.authorizationDetailsTypes !== undefined) {
      input.authorizationDetailsTypes = Array.isArray(payload.authorizationDetailsTypes)
        ? (payload.authorizationDetailsTypes as string[])
        : String(payload.authorizationDetailsTypes).split(/[\s,]+/).filter(Boolean);
    }

    // CIBA
    if (payload.bcDeliveryMode !== undefined) input.bcDeliveryMode = String(payload.bcDeliveryMode);
    if (payload.bcNotificationEndpoint !== undefined) input.bcNotificationEndpoint = String(payload.bcNotificationEndpoint);
    if (payload.bcRequestSignAlg !== undefined) input.bcRequestSignAlg = String(payload.bcRequestSignAlg) as any;
    if (payload.bcUserCodeRequired !== undefined) input.bcUserCodeRequired = Boolean(payload.bcUserCodeRequired);

    // Attributes — accept array of {key, value} objects
    if (payload.attributes !== undefined && Array.isArray(payload.attributes)) {
      input.attributes = payload.attributes as any;
    }

    // Locked
    if (payload.locked !== undefined) input.locked = Boolean(payload.locked);

    return input;
  }
}
