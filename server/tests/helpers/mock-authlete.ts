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
  service: { getConfiguration: MockFn; getJwks: MockFn }
  jwkSetEndpoint: { serviceJwksGetApi: MockFn }
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
    service: { getConfiguration: fn(), getJwks: fn() },
    jwkSetEndpoint: { serviceJwksGetApi: fn() },
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
    ...overrides,
  }

  return mock
}
