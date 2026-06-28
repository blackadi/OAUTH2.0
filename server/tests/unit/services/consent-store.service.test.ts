import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConsentStore } from "../../../src/services/consent-store.service";

describe("ConsentStore", () => {
  let store: ConsentStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new ConsentStore(24);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("grants consent when scopes match", () => {
    store.storeConsent("client-1", "user1", ["openid", "profile"]);
    expect(store.isConsentGranted("client-1", "user1", ["openid", "profile"])).toBe(true);
  });

  it("denies consent when required scopes are not covered", () => {
    store.storeConsent("client-1", "user1", ["openid"]);
    expect(store.isConsentGranted("client-1", "user1", ["openid", "email"])).toBe(false);
  });

  it("denies consent when no consent stored", () => {
    expect(store.isConsentGranted("client-1", "user1", ["openid"])).toBe(false);
  });

  it("returns true when stored scopes superset of required scopes", () => {
    store.storeConsent("client-1", "user1", ["openid", "profile", "email"]);
    expect(store.isConsentGranted("client-1", "user1", ["openid"])).toBe(true);
  });

  it("scopes consent by clientId and subject", () => {
    store.storeConsent("client-1", "user1", ["openid"]);
    expect(store.isConsentGranted("client-2", "user1", ["openid"])).toBe(false);
    expect(store.isConsentGranted("client-1", "user2", ["openid"])).toBe(false);
  });

  it("handles numeric clientId", () => {
    store.storeConsent(123, "user1", ["openid"]);
    expect(store.isConsentGranted(123, "user1", ["openid"])).toBe(true);
  });

  it("expires consent after TTL", () => {
    store.storeConsent("client-1", "user1", ["openid"]);
    expect(store.isConsentGranted("client-1", "user1", ["openid"])).toBe(true);
    vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours
    expect(store.isConsentGranted("client-1", "user1", ["openid"])).toBe(false);
  });

  it("revokes consent", () => {
    store.storeConsent("client-1", "user1", ["openid"]);
    expect(store.isConsentGranted("client-1", "user1", ["openid"])).toBe(true);
    store.revokeConsent("client-1", "user1");
    expect(store.isConsentGranted("client-1", "user1", ["openid"])).toBe(false);
  });

  it("does nothing when revoking non-existent consent", () => {
    store.revokeConsent("client-1", "user1");
    expect(store.isConsentGranted("client-1", "user1", ["openid"])).toBe(false);
  });

  it("handles empty required scopes", () => {
    store.storeConsent("client-1", "user1", ["openid"]);
    expect(store.isConsentGranted("client-1", "user1", [])).toBe(true);
  });

  it("uses default 24h TTL", () => {
    const defaultStore = new ConsentStore();
    defaultStore.storeConsent("client-1", "user1", ["openid"]);
    expect(defaultStore.isConsentGranted("client-1", "user1", ["openid"])).toBe(true);
  });
});
