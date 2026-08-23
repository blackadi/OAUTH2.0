import { screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FederationSection } from '@/components/oidc/FederationSection';
import { federationService } from '@/services';
import {
  mountSection,
  fill,
  fillAdminCredentials,
  press,
  selectOp,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * OpenID Federation — two operations with **opposite** authentication postures on one section.
 *
 * `configuration` is public: an entity configuration is a signed statement anybody may fetch, and
 * requiring a credential to read it would defeat the point. `registration` is admin-gated, because it
 * creates a client.
 *
 * This section is also where `check-route-coverage.mjs` earned its keep: `federation.service.ts` had no
 * tests and **could not have had any**, because the shared `tests/helpers/mock-authlete.ts` had no
 * `federation` member while claiming to cover every SDK method. A section whose service was untestable
 * is worth driving from the outside.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

const CREDENTIAL = btoa('mgmt-id:mgmt-secret');

/** An entity configuration is a signed JWT, so the endpoint answers a string, not an object. */
const ENTITY_CONFIG = {
  action: 'OK',
  responseContent:
    'eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS0xIn0.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAifQ.sig',
};

describe('FederationSection — the public half', () => {
  it('fetches the entity configuration with no credential', async () => {
    const spy = vi.spyOn(federationService, 'getConfiguration').mockResolvedValue(ENTITY_CONFIG);
    mountSection(<FederationSection />);
    await selectOp(/^Configuration$/i);

    press(/Fetch Configuration/i);

    const args = await expectCall(spy, 'the Fetch Configuration button');
    expect(
      args,
      'an entity configuration is a signed statement anybody may fetch — gating it defeats the point',
    ).toHaveLength(0);
    await expectReadsBack(/eyJhbGciOiJSUzI1NiI/, 'the signed entity configuration JWT');
  });
});

describe('FederationSection — the admin half', () => {
  it('sends the admin credential and the entity configuration on register', async () => {
    const spy = vi.spyOn(federationService, 'register').mockResolvedValue({ action: 'OK' });
    mountSection(<FederationSection />);
    await selectOp(/^Registration$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    fill(/Entity Configuration \(JWT\)/i, 'eyJhbGciOiJSUzI1NiJ9.rp.sig');
    press(/^Register$/i);

    const args = await expectCall(spy, 'the Register button');
    expectSends(args, CREDENTIAL, 'registration creates a client, so it is admin-gated');
    expectSends(args, 'eyJhbGciOiJSUzI1NiJ9.rp.sig', "the RP's own signed statement");
  });

  /**
   * The two inputs are **alternatives**, not a pair — the section's own copy says "— or —". Sending
   * both would be a different request, and sending an empty `trustChain` beside a real entity
   * configuration is sending both.
   */
  it('sends the entity configuration alone when that is what was filled in', async () => {
    const spy = vi.spyOn(federationService, 'register').mockResolvedValue({ action: 'OK' });
    mountSection(<FederationSection />);
    await selectOp(/^Registration$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    fill(/Entity Configuration \(JWT\)/i, 'eyJhbGciOiJSUzI1NiJ9.rp.sig');
    press(/^Register$/i);

    const [body] = (await expectCall(spy, 'the Register button')) as [Record<string, string>];
    expect(body.entityConfiguration).toBe('eyJhbGciOiJSUzI1NiJ9.rp.sig');
    expect(
      body.trustChain,
      'the two are alternatives, so the other key must be absent',
    ).toBeUndefined();
  });

  it('sends the trust chain alone when that is what was filled in', async () => {
    const spy = vi.spyOn(federationService, 'register').mockResolvedValue({ action: 'OK' });
    mountSection(<FederationSection />);
    await selectOp(/^Registration$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    fill(/Trust Chain \(JSON\)/i, '["jwt1","jwt2"]');
    press(/^Register$/i);

    const [body] = (await expectCall(spy, 'the Register button')) as [Record<string, string>];
    expect(body.trustChain).toBe('["jwt1","jwt2"]');
    expect(body.entityConfiguration).toBeUndefined();
  });

  it('refuses to register with neither filled in', async () => {
    const spy = vi.spyOn(federationService, 'register');
    mountSection(<FederationSection />);
    await selectOp(/^Registration$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    // There is nothing to register, and an empty body would earn a 400 nobody learns from.
    expect(screen.getByRole('button', { name: /^Register$/i })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('explains a refusal instead of printing it raw', async () => {
    vi.spyOn(federationService, 'register').mockRejectedValue(
      new Error(
        '{"error":"invalid_client","error_description":"Basic authentication is required."}',
      ),
    );
    mountSection(<FederationSection />);
    await selectOp(/^Registration$/i);
    fill(/Entity Configuration \(JWT\)/i, 'eyJhbGciOiJSUzI1NiJ9.rp.sig');
    press(/^Register$/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
  });
});
