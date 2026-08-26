import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VciSection } from '@/components/vci/VciSection';
import { vciService } from '@/services';
import {
  mountSection,
  fill,
  fillAdminCredentials,
  press,
  selectOp,
  seedTokens,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * VCI — **three** authentication categories on one section, which is the whole reason this file exists.
 *
 * | Group | What authenticates the call |
 * |---|---|
 * | Discovery (metadata, JWT issuer, JWKS, well-known) | nothing — public `GET` |
 * | Offers (create, info) | this deployment's **admin Basic auth** |
 * | Credential (issue, batch, deferred) | an **access token** |
 *
 * Getting the category wrong is exactly how `POST /api/vci/deferred/issue` came to authenticate nobody:
 * the handler collected no token at all, so a caller holding a `transactionId` — a handle, not a
 * credential — reached issuance, while its two siblings on the same router both answered `401`. **The
 * asymmetry was the bug**, and it was found by `check-route-coverage.mjs` rather than by reading the
 * code, because a controller test calls the handler directly and never touches the middleware chain.
 *
 * So the three credential tabs are asserted as **one posture**, the way the server-side fix was, rather
 * than one at a time — which is what would have caught the original.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

const CREDENTIAL = btoa('mgmt-id:mgmt-secret');

const OFFER_CREATED = {
  action: 'CREATED',
  info: {
    identifier: 'offer-77',
    credentialOfferUri: 'openid-credential-offer://?credential_offer_uri=https://as.example/o/77',
  },
};

describe('VciSection — discovery is public, and must stay that way', () => {
  it('fetches the credential issuer metadata with no credential at all', async () => {
    const spy = vi.spyOn(vciService, 'getMetadata').mockResolvedValue({
      credential_issuer: 'https://as.example',
      credential_endpoint: '/api/vci/credential/issue',
    });
    mountSection(<VciSection />);
    await selectOp(/^Metadata$/i);

    press(/Fetch|Get|Run/i);
    const args = await expectCall(spy, 'the Metadata button');

    // OID4VCI's issuer metadata is discovery: a credential here would be a bug in the other direction.
    expect(args).toHaveLength(0);
    await expectReadsBack(/credential_issuer/, "OID4VCI's own member name");
  });
});

describe('VciSection — offers carry the admin credential', () => {
  it('sends the admin credential and the configuration ids on create', async () => {
    const spy = vi.spyOn(vciService, 'createOffer').mockResolvedValue(OFFER_CREATED);
    mountSection(<VciSection />);
    await selectOp(/Create Offer/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    fill(/Credential Configuration IDs \(JSON array\)/i, '["VerifiedEmployee"]');
    fill(/Subject \(optional\)/i, 'alice');
    press(/Create Offer/i);

    const [body, auth] = (await expectCall(spy, 'the Create Offer button')) as [
      Record<string, unknown>,
      string,
    ];
    expect(auth).toBe(CREDENTIAL);
    expect(body.credentialConfigurationIds).toEqual(['VerifiedEmployee']);
    expect(body.subject).toBe('alice');
    // The two grant flags are always sent, because their *absence* is a different offer.
    expect(body.preAuthorizedCodeGrantIncluded).toBe(true);
    expect(body.authorizationCodeGrantIncluded).toBe(false);
  });

  it('omits the optional fields left blank rather than sending empty ones', async () => {
    const spy = vi.spyOn(vciService, 'createOffer').mockResolvedValue(OFFER_CREATED);
    mountSection(<VciSection />);
    await selectOp(/Create Offer/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');
    press(/Create Offer/i);

    const [body] = (await expectCall(spy, 'the Create Offer button')) as [Record<string, unknown>];
    expect(body.subject).toBeUndefined();
    expect(body.duration).toBeUndefined();
    // A `txCode` only means anything alongside the pre-authorized code grant.
    expect(body.txCode).toBeUndefined();
  });

  it('sends the admin credential on offer info too', async () => {
    const spy = vi.spyOn(vciService, 'getOfferInfo').mockResolvedValue(OFFER_CREATED);
    mountSection(<VciSection />);
    await selectOp(/Get Offer Info/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    fill(/Offer Identifier/i, 'offer-77');
    press(/Get Offer Info|Run/i);

    const args = await expectCall(spy, 'the Offer Info button');
    expectSends(args, CREDENTIAL, 'the offer endpoints are admin-gated');
    expectSends(args, 'offer-77', 'the identifier the user typed');
  });
});

describe('VciSection — all three credential endpoints present a token', () => {
  /**
   * Asserted as one posture. `deferred/issue` used to be the odd one out: it collected no token, so a
   * `transactionId` alone reached issuance while `issue` and `batch` both answered 401 without one.
   */
  it.each([
    ['cred-issue', /^Issue$/i, /^Issue Credential$|^Issue$/i, 'issueCredential'],
    ['cred-batch', /^Batch$/i, /Batch|Issue/i, 'batchCredential'],
    ['deferred-issue', /^Deferred$/i, /Issue Deferred/i, 'issueDeferred'],
  ] as const)('%s carries the access token', async (_op, tab, button, method) => {
    const spy = vi
      .spyOn(vciService, method)
      .mockResolvedValue({ action: 'OK', responseContent: '{}' });
    mountSection(<VciSection />);
    await selectOp(tab);

    fill(/^Access Token$/i, 'at-vci-01');
    press(button);

    const args = await expectCall(spy, `the ${String(method)} button`);
    expectSends(
      args,
      'at-vci-01',
      'all three credential endpoints validate an access token — the deferred one authenticated nobody until 2026-08-13',
    );
  });

  /**
   * **`transactionId` is required and a bare `requestIdentifier` is refused**, because that was the
   * shape which bypassed validation: it carries no `transaction_id` for Authlete's deferred *parse* API
   * to check. The section sends whatever JSON is typed, so what this pins is that the field the user
   * wrote is the field that travels — not a rewrite, and not a body-supplied `requestIdentifier`.
   */
  it('sends the deferred order as typed, so transactionId reaches the parse call', async () => {
    const spy = vi
      .spyOn(vciService, 'issueDeferred')
      .mockResolvedValue({ action: 'OK', responseContent: '{}' });
    mountSection(<VciSection />);
    await selectOp(/^Deferred$/i);

    fill(/^Access Token$/i, 'at-vci-01');
    fill(/Order \(JSON\)/i, '{"transactionId":"txn-9"}');
    press(/Issue Deferred/i);

    const [body] = (await expectCall(spy, 'the Issue Deferred button')) as [
      { accessToken: string; order: Record<string, unknown> },
    ];
    expect(body.accessToken).toBe('at-vci-01');
    expect(body.order.transactionId).toBe('txn-9');
    // `requestIdentifier` comes from `parse`'s `info.identifier` server-side, **never** from the body —
    // taking it from the caller would let any valid token name any pending request.
    expect(body.order.requestIdentifier).toBeUndefined();
  });

  it('pre-fills the access token from the token in session, so it need not be pasted', async () => {
    seedTokens({ access_token: 'at-from-context' });
    mountSection(<VciSection />);
    await selectOp(/^Issue$/i);

    await waitFor(() =>
      expect((screen.getByLabelText(/^Access Token$/i) as HTMLInputElement).value).toBe(
        'at-from-context',
      ),
    );
  });

  /**
   * On `UNAUTHORIZED` the deferred endpoint's `responseContent` is a **`WWW-Authenticate` challenge
   * string**, not JSON — the one of the four `sendSpecBody` endpoints where "return responseContent as
   * the body" is wrong. The server puts it in the header and sends an OAuth-shaped error body, and
   * `[A375304]` is what a bogus token earns.
   */
  it('explains a rejected token instead of printing it raw', async () => {
    vi.spyOn(vciService, 'issueDeferred').mockRejectedValue(
      new Error(
        '{"error":"invalid_token","error_description":"[A375304] The access token does not exist."}',
      ),
    );
    mountSection(<VciSection />);
    await selectOp(/^Deferred$/i);
    fill(/^Access Token$/i, 'bogus');
    press(/Issue Deferred/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
    await expectReadsBack(/A375304/, 'the vendor code for a nonexistent access token');
  });
});
