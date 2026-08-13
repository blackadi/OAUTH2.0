import type { MockedFunction } from "vitest"
import { vi } from "vitest"

type MockFn = MockedFunction<(...args: any[]) => any>

export interface MockAuthleteApi {
  authorization: { processRequest: MockFn; fail: MockFn; issue: MockFn }
  token: {
    process: MockFn
    issue: MockFn
    fail: MockFn
    management: {
      create: MockFn
      update: MockFn
      delete: MockFn
      list: MockFn
      revoke: MockFn
      reissueIdToken: MockFn
    }
  }
  userinfo: { process: MockFn; issue: MockFn }
  introspection: { process: MockFn; standardProcess: MockFn }
  revocation: { process: MockFn }
  service: { getConfiguration: MockFn; getJwks: MockFn; get: MockFn }
  jwkSetEndpoint: { serviceJwksGetApi: MockFn }
  lifecycle: { getApiLifecycleHealthcheck: MockFn }
  dynamicClientRegistration: { register: MockFn; get: MockFn; update: MockFn; delete: MockFn }
  ciba: { processAuthentication: MockFn; issue: MockFn; fail: MockFn; complete: MockFn }
  pushedAuthorization: { create: MockFn }
  grantManagement: { processRequest: MockFn }
  client: {
    list: MockFn
    get: MockFn
    create: MockFn
    update: MockFn
    delete: MockFn
    management: {
      updateLockFlag: MockFn
      refreshSecret: MockFn
      updateSecret: MockFn
      listAuthorizations: MockFn
      updateAuthorizations: MockFn
      deleteAuthorizations: MockFn
      getGrantedScopes: MockFn
      deleteGrantedScopes: MockFn
      getRequestableScopes: MockFn
      updateRequestableScopes: MockFn
      deleteRequestableScopes: MockFn
    }
  }
  joseObject: { joseVerifyApi: MockFn }
  deviceFlow: { authorization: MockFn; verification: MockFn; complete: MockFn }
  hardwareSecurityKeys: { create: MockFn; get: MockFn; delete: MockFn; list: MockFn }
  verifiableCredentials: {
    getMetadata: MockFn;
    getJwtIssuer: MockFn;
    getJwks: MockFn;
    createOffer: MockFn;
    getOfferInfo: MockFn;
    parse: MockFn;
    issue: MockFn;
    batchParse: MockFn;
    batchIssue: MockFn;
    deferredParse: MockFn;
    deferredIssue: MockFn;
  }
  // Added 2026-08-13: `federation` was missing, so `federation.service.ts` was untestable and had no tests
  // at all. The file's claim to cover "every SDK method" was inaccurate; check before relying on it.
  federation: { configuration: MockFn; registration: MockFn }
  // Added 2026-08-13, the same gap a second time: `nativeSso` was absent, so `native-sso.service.ts` was
  // unmockable through this helper and had no test of any kind — the two routes were group A in
  // `check-route-coverage.mjs --triage`. `service.get` was missing for the same reason and is why
  // `fapi.controller.ts`'s two call sites had to hand-roll their own mock.
  //
  // The members here are now checked against the SDK rather than assumed: `Authlete` exposes 20 sub-APIs
  // (`node_modules/@authlete/typescript-sdk/dist/commonjs/sdk/sdk.d.ts`), and this covers every one the
  // server actually calls. Before adding a call site to a service, check the member exists here first —
  // a missing member does not fail the build, it just makes the surface untestable and therefore untested.
  nativeSso: { process: MockFn; logout: MockFn }
}

export function createMockAuthlete(overrides?: Partial<MockAuthleteApi>) {
  const fn = () => vi.fn()

  const mock = {
    authorization: { processRequest: fn(), fail: fn(), issue: fn() },
    token: {
      process: fn(),
      issue: fn(),
      fail: fn(),
      management: {
        create: fn(),
        update: fn(),
        delete: fn(),
        list: fn(),
        revoke: fn(),
        reissueIdToken: fn(),
      },
    },
    userinfo: { process: fn(), issue: fn() },
    introspection: { process: fn(), standardProcess: fn() },
    revocation: { process: fn() },
    service: { getConfiguration: fn(), getJwks: fn(), get: fn() },
    jwkSetEndpoint: { serviceJwksGetApi: fn() },
    lifecycle: { getApiLifecycleHealthcheck: fn() },
    dynamicClientRegistration: {
      register: fn(),
      get: fn(),
      update: fn(),
      delete: fn(),
    },
    ciba: {
      processAuthentication: fn(),
      issue: fn(),
      fail: fn(),
      complete: fn(),
    },
    pushedAuthorization: { create: fn() },
    grantManagement: { processRequest: fn() },
    client: {
      list: fn(),
      get: fn(),
      create: fn(),
      update: fn(),
      delete: fn(),
      management: {
        updateLockFlag: fn(),
        refreshSecret: fn(),
        updateSecret: fn(),
        listAuthorizations: fn(),
        updateAuthorizations: fn(),
        deleteAuthorizations: fn(),
        getGrantedScopes: fn(),
        deleteGrantedScopes: fn(),
        getRequestableScopes: fn(),
        updateRequestableScopes: fn(),
        deleteRequestableScopes: fn(),
      },
    },
    joseObject: { joseVerifyApi: fn() },
    deviceFlow: {
      authorization: fn(),
      verification: fn(),
      complete: fn(),
    },
    hardwareSecurityKeys: {
      create: fn(),
      get: fn(),
      delete: fn(),
      list: fn(),
    },
    verifiableCredentials: {
      getMetadata: fn(),
      getJwtIssuer: fn(),
      getJwks: fn(),
      createOffer: fn(),
      getOfferInfo: fn(),
      parse: fn(),
      issue: fn(),
      batchParse: fn(),
      batchIssue: fn(),
      deferredParse: fn(),
      deferredIssue: fn(),
    },
    federation: {
      configuration: fn(),
      registration: fn(),
    },
    nativeSso: {
      process: fn(),
      logout: fn(),
    },
    ...overrides,
  }

  return mock
}
