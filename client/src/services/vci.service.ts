import { http } from './http';
import {
  VCI_METADATA_ENDPOINT,
  VCI_JWTISSUER_ENDPOINT,
  VCI_JWKS_ENDPOINT,
  VCI_WELLKNOWN_ENDPOINT,
  VCI_OFFER_CREATE_ENDPOINT,
  VCI_OFFER_INFO_ENDPOINT,
  VCI_CREDENTIAL_ISSUE_ENDPOINT,
  VCI_CREDENTIAL_BATCH_ENDPOINT,
  VCI_DEFERRED_ISSUE_ENDPOINT,
} from '@/config';

async function getMetadata(): Promise<unknown> {
  return http.getJson(VCI_METADATA_ENDPOINT);
}

async function getJwtIssuer(): Promise<unknown> {
  return http.getJson(VCI_JWTISSUER_ENDPOINT);
}

async function getJwks(): Promise<unknown> {
  return http.getJson(VCI_JWKS_ENDPOINT);
}

async function getWellKnown(): Promise<unknown> {
  return http.getJson(VCI_WELLKNOWN_ENDPOINT);
}

async function createOffer(body: Record<string, unknown>, auth: string): Promise<unknown> {
  return http.postAdmin(VCI_OFFER_CREATE_ENDPOINT, body, auth);
}

async function getOfferInfo(body: Record<string, unknown>, auth: string): Promise<unknown> {
  return http.postAdmin(VCI_OFFER_INFO_ENDPOINT, body, auth);
}

async function issueCredential(body: Record<string, unknown>): Promise<unknown> {
  return http.postJson(VCI_CREDENTIAL_ISSUE_ENDPOINT, body);
}

async function batchCredential(body: Record<string, unknown>): Promise<unknown> {
  return http.postJson(VCI_CREDENTIAL_BATCH_ENDPOINT, body);
}

async function issueDeferred(body: Record<string, unknown>): Promise<unknown> {
  return http.postJson(VCI_DEFERRED_ISSUE_ENDPOINT, body);
}

export const vciService = {
  getMetadata,
  getJwtIssuer,
  getJwks,
  getWellKnown,
  createOffer,
  getOfferInfo,
  issueCredential,
  batchCredential,
  issueDeferred,
};
