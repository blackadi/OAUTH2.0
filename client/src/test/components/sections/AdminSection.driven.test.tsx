import { screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdminSection } from '@/components/admin/AdminSection';
import { adminService } from '@/services';
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
 * Admin Token Management — the section that named the fourth dead-flow class.
 *
 * `GET /api/token/createLocalToken` gained a `checkAuth` call server-side, and `adminService.localToken`
 * was the one admin call in its file passing no `auth`. So the button 401'd in the only environment
 * where the endpoint exists at all — and **its unit test asserted `headers: { Accept }` exactly**, which
 * pinned the missing credential in place. A test that asserts an exact argument object cannot
 * distinguish "this is what we send" from "this is all we send", and the second is a defect report.
 *
 * Every assertion here is therefore about **presence**. Nothing below says "and nothing else".
 */

beforeEach(resetSectionState);
afterEach(cleanup);

/** `btoa('mgmt-id:mgmt-secret')` — what `useCredentials` hands every admin service in this section. */
const CREDENTIAL = btoa('mgmt-id:mgmt-secret');

/** What `POST /api/token/create` answers with, near enough for the panel to render. */
const CREATED = {
  action: 'OK',
  accessToken: 'at-created-01',
  accessTokenIdentifier: 'ati-created-01',
  grantType: 'CLIENT_CREDENTIALS',
};

/** `localSignedToken` returns exactly these two fields (`token.operations.service.ts`). */
const LOCAL_JWT = {
  token: 'eyJ0eXAiOiJhdCtqd3QiLCJhbGciOiJSUzI1NiJ9.e30.sig',
  publicKey: '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----',
};

describe('AdminSection — the credential every operation must carry', () => {
  it('refuses to offer any operation until the management credential is entered', () => {
    mountSection(<AdminSection />);

    // Every tab, not a sample: this is the gate, and a gate with one hole is not a gate.
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab, `"${tab.textContent}" is selectable with no credential entered`).toBeDisabled();
    }
  });

  /**
   * The regression that gave this file its reason to exist.
   *
   * The server's `checkAuth` sits deliberately *after* the `nodeEnv` guard, so production answers 404
   * and development answers 401 — meaning this defect was invisible everywhere except the one place the
   * feature works.
   */
  it('sends the admin credential on the local JWT call, which is where it was missing', async () => {
    const spy = vi.spyOn(adminService, 'localToken').mockResolvedValue(LOCAL_JWT);
    mountSection(<AdminSection />);
    fillAdminCredentials();
    await selectOp(/Local JWT/i);

    fill(/Issuer \(iss\)/i, 'https://as.example.com');
    fill(/Subject \(sub\)/i, 'user-1');
    fill(/Audience \(aud\)/i, 'https://api.example.com');
    fill(/Client ID \(client_id\)/i, '4277838306');
    press(/^Run$/i);

    const args = await expectCall(spy, 'the Local JWT Run button');
    expectSends(
      args,
      CREDENTIAL,
      'GET /api/token/createLocalToken is admin-authenticated; this call passed no `auth` at all',
    );
    // RFC 9068 §2.2 makes `client_id` REQUIRED, and the server 400s without it — so the field the user
    // typed has to be the one that travels, not a constant and not the admin id.
    expectSends(args, '4277838306', 'RFC 9068 §2.2 makes `client_id` REQUIRED on the local JWT');
  });

  it('omits `scope` when it is blank rather than sending an empty one', async () => {
    const spy = vi.spyOn(adminService, 'localToken').mockResolvedValue(LOCAL_JWT);
    mountSection(<AdminSection />);
    fillAdminCredentials();
    await selectOp(/Local JWT/i);
    fill(/Client ID \(client_id\)/i, '4277838306');
    press(/^Run$/i);

    const [params] = (await expectCall(spy, 'the Local JWT Run button')) as [
      Record<string, string>,
    ];
    // §2.2.3 makes `scope` a SHOULD, and an empty one is not the same claim as an absent one — the
    // token is a worked example, so a `scope: ""` claim would teach the wrong shape.
    expect(params).not.toHaveProperty('scope');
  });

  it('carries the credential on List, which takes nothing else at all', async () => {
    const spy = vi.spyOn(adminService, 'listTokens').mockResolvedValue({ accessTokens: [] });
    mountSection(<AdminSection />);
    fillAdminCredentials();
    await selectOp(/^List$/i);
    press(/^Run$/i);

    const args = await expectCall(spy, 'the List Run button');
    expectSends(args, CREDENTIAL, 'every /api/token/* route is behind requireBasicAuth');
  });

  /**
   * `grantType` came from a free-text Input until the server started refusing what it did not
   * recognise (B1-W3) — a typo used to mint a token whose recorded provenance was a fiction. It is a
   * `Select` now, so the assertion worth making is that the *selected* value is what travels.
   */
  it('sends the selected grant type, not a default, on Create', async () => {
    const spy = vi.spyOn(adminService, 'createToken').mockResolvedValue(CREATED);
    mountSection(<AdminSection />);
    fillAdminCredentials();
    await selectOp(/^Create$/i);

    fill(/Grant Type/i, 'CLIENT_CREDENTIALS');
    fill(/^Subject$/i, 'user-1');
    press(/^Run$/i);

    const args = await expectCall(spy, 'the Create Run button');
    expectSends(args, CREDENTIAL, 'POST /api/token/create is admin-authenticated');
    expectSends(args, 'CLIENT_CREDENTIALS', 'the grant type the user chose records the provenance');
  });

  /** The FAPI class: the section has to read the fields the server actually returns. */
  it('renders the token the server returned, not an empty panel', async () => {
    vi.spyOn(adminService, 'localToken').mockResolvedValue(LOCAL_JWT);
    mountSection(<AdminSection />);
    fillAdminCredentials();
    await selectOp(/Local JWT/i);
    fill(/Client ID \(client_id\)/i, '4277838306');
    press(/^Run$/i);

    await expectReadsBack(/eyJ0eXAiOiJhdCtqd3Qi/, 'the signed local JWT');
  });

  /**
   * A 401 here is the *expected* failure while credentials are wrong, so it is the one this section
   * most needs to explain rather than print raw.
   */
  it('explains a refusal instead of printing it raw', async () => {
    // `requireBasicAuth` answers exactly this body, deliberately indistinguishable from "no
    // credentials supplied" — telling an anonymous caller that admin auth is misconfigured is free
    // reconnaissance. Which makes the client's explanation the only place a *legitimate* operator
    // finds out what to check.
    vi.spyOn(adminService, 'listTokens').mockRejectedValue(
      new Error(
        '{"error":"invalid_client","error_description":"Basic authentication is required."}',
      ),
    );
    mountSection(<AdminSection />);
    fillAdminCredentials();
    await selectOp(/^List$/i);
    press(/^Run$/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
  });
});
