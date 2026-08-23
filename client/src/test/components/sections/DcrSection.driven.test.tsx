import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DcrSection } from '@/components/oidc/DcrSection';
import { dcrService } from '@/services';
import {
  mountSection,
  fill,
  fillAdminCredentials,
  press,
  selectOp,
  confirmDialog,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * DCR — where **two different credentials** are in play, and mixing them up is the whole risk.
 *
 * `register` is gated on this deployment's **admin Basic auth**, which is a deliberate departure from
 * RFC 7591 §3: the RFC says the endpoint *"SHOULD allow registration requests with no authorization"*
 * and MAY require an initial access token *"in the form of an OAuth 2.0 access token"*. This is neither
 * — it refuses open registration outright, because a public teaching server with an open `register` is
 * a free client factory for anyone who finds it.
 *
 * `get`/`update`/`delete` use the **registration access token** from the request body, which *is* RFC
 * 7592's mechanism. So the admin credential must reach exactly one of the four, and the registration
 * token exactly the other three. Both directions are asserted, because sending the admin credential
 * where RFC 7592 wants a registration token would look like it worked.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

const CREDENTIAL = btoa('mgmt-id:mgmt-secret');

/**
 * RFC 7591 §3.2.1's registration response, **as the body** — no vendor envelope.
 *
 * Until T1-11 the server returned Authlete's envelope with this nested inside a `responseContent`
 * string, so a conforming client found `action` and `resultCode` at the top level and had to unwrap a
 * vendor field to reach `client_id`. `DcrSection` unwraps nothing now, and this fixture is what makes
 * that assertion meaningful.
 */
const REGISTERED = {
  client_id: 'dcr-4242',
  client_secret: 'dcr-secret-4242',
  registration_access_token: 'rat-4242',
  registration_client_uri: 'https://as.example.com/api/client/dcr/get',
  client_id_issued_at: 1755900000,
  redirect_uris: ['http://localhost:3001/callback'],
};

describe('DcrSection — two credentials, one endpoint each', () => {
  it('sends the admin credential on register, which RFC 7591 §3 does not require but this server does', async () => {
    const spy = vi.spyOn(dcrService, 'dcrRegister').mockResolvedValue(REGISTERED);
    mountSection(<DcrSection />);
    fillAdminCredentials();
    await selectOp(/^Register$/i);

    fill(/Client Metadata \(JSON\)/i, JSON.stringify({ client_name: 'Driven' }));
    press(/^Run$/i);

    const args = await expectCall(spy, 'the Register Run button');
    expectSends(
      args,
      CREDENTIAL,
      'this deployment gates register on MGMT_CLIENT_ID/MGMT_CLIENT_SECRET',
    );
    expectSends(args, 'Driven', 'the metadata document the user typed is what gets registered');
  });

  /**
   * The other half, and the one worth stating out loud: RFC 7592 §2 authenticates with the
   * **registration access token**, so the admin credential has no business on these three.
   */
  it('uses the registration access token on get, not the admin credential', async () => {
    const spy = vi.spyOn(dcrService, 'dcrGet').mockResolvedValue(REGISTERED);
    mountSection(<DcrSection />);
    fillAdminCredentials();
    await selectOp(/^Get$/i);

    fill(/^Client ID$/i, 'dcr-4242');
    fill(/^Registration Access Token$/i, 'rat-4242');
    press(/^Run$/i);

    const args = (await expectCall(spy, 'the Get Run button')) as string[];
    expect(args).toEqual(['rat-4242', 'dcr-4242']);
    // Order matters and is easy to transpose — token first, then client id.
    expect(
      args.includes(CREDENTIAL),
      'RFC 7592 §2 authenticates with the registration access token; the admin credential is a different thing',
    ).toBe(false);
  });

  /**
   * **RFC 7592 §2.2's metadata document must contain `client_id`.**
   *
   * The e2e suite hid a genuine test bug for months on exactly this: the DCR update had *never* sent a
   * conformant request, because it sent only the changed field, and Authlete answers `[A214301]`. The
   * section passes the JSON through verbatim, so what this pins is that the id and token both travel
   * and the document is not rewritten on the way.
   */
  it('sends the update document verbatim, alongside the id and token', async () => {
    const spy = vi.spyOn(dcrService, 'dcrUpdate').mockResolvedValue(REGISTERED);
    mountSection(<DcrSection />);
    await selectOp(/^Update$/i);

    const document = JSON.stringify({ client_id: 'dcr-4242', client_name: 'Renamed' });
    fill(/^Client ID$/i, 'dcr-4242');
    fill(/^Registration Access Token$/i, 'rat-4242');
    fill(/Updated Client Metadata \(JSON\)/i, document);
    press(/^Run$/i);

    const args = (await expectCall(spy, 'the Update Run button')) as string[];
    expect(args).toEqual([document, 'rat-4242', 'dcr-4242']);
  });

  it('makes a deregistration pass through a typed confirmation', async () => {
    const spy = vi.spyOn(dcrService, 'dcrDelete').mockResolvedValue(undefined);
    mountSection(<DcrSection />);
    await selectOp(/^Delete$/i);

    fill(/^Client ID$/i, 'dcr-4242');
    fill(/^Registration Access Token$/i, 'rat-4242');
    press(/^Delete$/i);

    expect(spy, 'the dialog must open before anything is deregistered').not.toHaveBeenCalled();
    await confirmDialog('dcr-4242');

    const args = (await expectCall(spy, 'the confirmed deregistration')) as string[];
    expect(args).toEqual(['rat-4242', 'dcr-4242']);
  });
});

describe('DcrSection — what it reads back', () => {
  /**
   * The registration response carries the credentials for the *next three* operations, so a rename on
   * either field leaves the user to copy them by hand — and, before T1-11, to unwrap a vendor envelope
   * first. This is the FAPI class applied to a hand-off between tabs.
   */
  it('carries the client_id and registration token forward into the other three tabs', async () => {
    vi.spyOn(dcrService, 'dcrRegister').mockResolvedValue(REGISTERED);
    mountSection(<DcrSection />);
    fillAdminCredentials();
    await selectOp(/^Register$/i);
    fill(/Client Metadata \(JSON\)/i, JSON.stringify({ client_name: 'Driven' }));
    press(/^Run$/i);

    await expectReadsBack(/dcr-4242/, 'the registered client id in the response');

    await selectOp(/^Get$/i);
    await waitFor(() => {
      expect((screen.getByLabelText(/^Client ID$/i) as HTMLInputElement).value).toBe('dcr-4242');
      expect(
        (screen.getByLabelText(/^Registration Access Token$/i) as HTMLInputElement).value,
      ).toBe('rat-4242');
    });
  });

  it('renders the registration response as the specification shapes it, unwrapping nothing', async () => {
    vi.spyOn(dcrService, 'dcrRegister').mockResolvedValue(REGISTERED);
    mountSection(<DcrSection />);
    fillAdminCredentials();
    await selectOp(/^Register$/i);
    press(/^Run$/i);

    // snake_case members straight from RFC 7591 §3.2.1 — an `action`/`resultCode` envelope here would
    // mean the server regressed and the section is displaying a vendor wrapper.
    await expectReadsBack(/registration_access_token/, "RFC 7591 §3.2.1's own member name");
    await expectReadsBack(/rat-4242/, 'the registration access token value');
  });

  it('explains a refusal instead of printing it raw', async () => {
    vi.spyOn(dcrService, 'dcrRegister').mockRejectedValue(
      new Error(
        '{"error":"invalid_client_metadata","error_description":"[A214301] bad metadata."}',
      ),
    );
    mountSection(<DcrSection />);
    fillAdminCredentials();
    await selectOp(/^Register$/i);
    press(/^Run$/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
    await expectReadsBack(/A214301/, 'the vendor code for malformed client metadata');
  });
});
