import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenOpsSection } from '@/components/oidc/TokenOpsSection';
import { tokenService } from '@/services';
import {
  mountSection,
  fill,
  fillAdminCredentials,
  press,
  seedTokens,
  seedDpopKey,
  confirmDialog,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * Token Operations — **the scheme is decided by the token, not by preference.**
 *
 * This section called `tokenService.userInfo()` unconditionally, which sends `Authorization: Bearer`.
 * RFC 9449 §7.1 gives a sender-constrained token no bearer option and §7.2 requires the resource to
 * reject the downgrade; Authlete enforces it with `[A089311]` at `/auth/userinfo`. Since Grant Flows
 * used to mint a DPoP-bound token whether you asked or not, **that made the headline flow produce a
 * token half the app could not use** — and the button looked perfectly fine while doing it.
 *
 * That is the JAR class in its sharpest form: the request went out, and it was wrong in a way only the
 * server could see. So the two branches are driven separately, and the third case — a bound token with
 * no key in session — is asserted to refuse **locally** rather than send a request Authlete must
 * reject.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

const CREDENTIAL = btoa('mgmt-id:mgmt-secret');
const USERINFO = { sub: 'user-1', name: 'Ada', email: 'ada@example.com' };

describe('TokenOpsSection — presenting the token the way it requires', () => {
  it('offers nothing at all without a token, rather than sending an empty one', () => {
    mountSection(<TokenOpsSection />);
    for (const name of [/UserInfo/i, /Introspect \(Authlete\)/i, /Revoke Token/i]) {
      expect(
        screen.getByRole('button', { name }),
        `"${String(name)}" is enabled with no token`,
      ).toBeDisabled();
    }
  });

  it('presents a bearer token with the Bearer scheme', async () => {
    seedTokens({ access_token: 'at-bearer-01', token_type: 'Bearer' });
    const bearer = vi.spyOn(tokenService, 'userInfo').mockResolvedValue(USERINFO);
    const dpop = vi.spyOn(tokenService, 'userInfoWithDpop');
    mountSection(<TokenOpsSection />);

    press(/UserInfo/i);

    const args = (await expectCall(bearer, 'the UserInfo button')) as string[];
    expect(args).toEqual(['at-bearer-01']);
    expect(dpop, 'a token with no `cnf` has no binding to prove').not.toHaveBeenCalled();
    await expectReadsBack(/ada@example.com/, 'the claims from UserInfo');
  });

  /**
   * `isDpopBound` comes from `token_type`, compared case-insensitively per RFC 9110 §11.1 — so this is
   * exactly the state a user reaches after the headline flow with DPoP enabled.
   */
  it('presents a DPoP-bound token with the DPoP scheme and a proof', async () => {
    seedTokens({ access_token: 'at-bound-01', token_type: 'DPoP' });
    seedDpopKey();
    const dpop = vi.spyOn(tokenService, 'userInfoWithDpop').mockResolvedValue({ data: USERINFO });
    const bearer = vi.spyOn(tokenService, 'userInfo');
    mountSection(<TokenOpsSection />);

    press(/UserInfo/i);

    const [token, proofFactory] = (await expectCall(dpop, 'the UserInfo button')) as [
      string,
      unknown,
    ];
    expect(token).toBe('at-bound-01');
    // A factory, not a proof: §9 answers a missing nonce with 401 and `dpopRequest` re-signs, and the
    // nonce lives inside the signature.
    expect(typeof proofFactory).toBe('function');
    expect(
      bearer,
      '§7.2 — Authlete refuses the bearer downgrade with [A089311]; sending it anyway is the defect',
    ).not.toHaveBeenCalled();
  });

  /**
   * The third state, which is neither branch: a bound token and **no key**. Sending `Bearer` would earn
   * `[A089311]` and sending `DPoP` with no proof would earn `invalid_dpop_proof`. Saying so locally is
   * the only useful answer, and the section says it in the status line rather than after a round trip.
   */
  it('says a bound token with no key in session will be refused, before anything is sent', () => {
    seedTokens({ access_token: 'at-bound-01', token_type: 'dpop' });
    // Deliberately no `seedDpopKey()`. Lowercase `dpop` too: RFC 9110 §11.1 makes the scheme
    // case-insensitive, so the binding must still be recognised.
    mountSection(<TokenOpsSection />);

    expect(
      screen.getByText(/no DPoP key is in this session — UserInfo will be refused/i),
    ).toBeInTheDocument();
  });
});

describe('TokenOpsSection — introspection, which is admin-gated', () => {
  it('sends the admin credential and the token on the Authlete endpoint', async () => {
    seedTokens({ access_token: 'at-bearer-01' });
    const spy = vi.spyOn(tokenService, 'introspection').mockResolvedValue({ active: true });
    mountSection(<TokenOpsSection />);
    fillAdminCredentials();

    press(/Introspect \(Authlete\)/i);

    const args = await expectCall(spy, 'the Introspect (Authlete) button');
    expectSends(args, 'at-bearer-01', 'the token being introspected');
    expectSends(args, 'mgmt-id', 'RFC 7662 §2.1 requires the endpoint be protected');
    expectSends(args, 'mgmt-secret', 'RFC 7662 §2.1 requires the endpoint be protected');
  });

  /**
   * RFC 9470 step-up: the options are what make the endpoint answer with an
   * `insufficient_user_authentication` challenge naming `acr_values`/`max_age`. Sent only when set, so
   * an unasked-for requirement is not invented.
   */
  it('sends the step-up options only when they are filled in', async () => {
    seedTokens({ access_token: 'at-bearer-01' });
    const spy = vi.spyOn(tokenService, 'introspection').mockResolvedValue({ active: true });
    mountSection(<TokenOpsSection />);
    fillAdminCredentials();

    press(/Introspect \(Authlete\)/i);
    let args = (await expectCall(spy, 'the Introspect button')) as unknown[];
    expect(args[3], 'no options set, so none are sent').toBeUndefined();

    spy.mockClear();
    fill(/ACR Values \(space-separated\)/i, 'urn:mace:incommon:iap:silver');
    fill(/Max Authentication Age \(seconds\)/i, '300');
    press(/Introspect \(Authlete\)/i);

    args = (await expectCall(spy, 'the Introspect button')) as unknown[];
    expect(args[3]).toEqual({ acrValues: 'urn:mace:incommon:iap:silver', maxAge: 300 });
  });

  it('sends the admin credential on the RFC 7662 endpoint too', async () => {
    seedTokens({ access_token: 'at-bearer-01' });
    const spy = vi
      .spyOn(tokenService, 'introspectionStandard')
      .mockResolvedValue({ active: true, scope: 'openid' });
    mountSection(<TokenOpsSection />);
    fillAdminCredentials();

    press(/Introspect \(RFC 7662\)/i);

    const args = (await expectCall(spy, 'the Introspect (RFC 7662) button')) as string[];
    expect(args).toEqual(['at-bearer-01', 'mgmt-id', 'mgmt-secret']);
  });
});

describe('TokenOpsSection — revocation, the one that destroys something', () => {
  /**
   * RFC 7009 §2.1 permits the server to revoke the whole grant, so the refresh token issued alongside
   * may go with it. That is why this one is behind a confirmation and the other three are not.
   */
  it('passes through a confirmation before revoking', async () => {
    seedTokens({ access_token: 'at-bearer-01' });
    const spy = vi.spyOn(tokenService, 'revocation').mockResolvedValue(undefined);
    mountSection(<TokenOpsSection />);

    press(/Revoke Token/i);
    expect(spy, 'the dialog must open before anything is revoked').not.toHaveBeenCalled();
    await confirmDialog();

    const args = (await expectCall(spy, 'the confirmed revocation')) as unknown[];
    expect(args[0]).toBe('at-bearer-01');
    // RFC 7009 §2.1's `token_type_hint` — the server may use it to look in the right place first.
    expect(args[3]).toBe('access_token');
  });

  /**
   * Revocation authenticates as the **client**, not as the deployment admin, and the two are different
   * credentials — the fields are separate for that reason. `revocation` shares
   * `postWithOptionalBasic`'s posture, so a public client sends none.
   */
  it('uses the client credentials, not the admin ones', async () => {
    seedTokens({ access_token: 'at-bearer-01' });
    const spy = vi.spyOn(tokenService, 'revocation').mockResolvedValue(undefined);
    mountSection(<TokenOpsSection />);
    fillAdminCredentials();

    fill(/Revocation Client ID/i, '1523514379');
    fill(/Revocation Client Secret/i, 'client-secret');
    press(/Revoke Token/i);
    await confirmDialog();

    const args = (await expectCall(spy, 'the confirmed revocation')) as unknown[];
    expect(args[1]).toBe('1523514379');
    expect(args[2]).toBe('client-secret');
    expect(
      args.includes(CREDENTIAL),
      'RFC 7009 §2.1 authenticates the client; the admin credential is a different thing',
    ).toBe(false);
  });

  it('explains the bearer downgrade instead of printing it raw', async () => {
    seedTokens({ access_token: 'at-bound-01', token_type: 'DPoP' });
    seedDpopKey();
    vi.spyOn(tokenService, 'userInfoWithDpop').mockRejectedValue(
      new Error(
        '{"error":"invalid_token","error_description":"[A089311] The access token is bound to a key."}',
      ),
    );
    mountSection(<TokenOpsSection />);
    press(/UserInfo/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/A089311/).length).toBeGreaterThan(0));
  });
});
