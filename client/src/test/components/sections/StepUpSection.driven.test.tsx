import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StepUpSection } from '@/components/oidc/StepUpSection';
import { tokenService } from '@/services';
import {
  mountSection,
  fill,
  fillAdminCredentials,
  press,
  seedTokens,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * Step-Up Authentication — RFC 9470, and the section whose whole output is a **re-authorization
 * request built from a challenge**.
 *
 * The chain is: introspect with requirements → the resource answers
 * `insufficient_user_authentication` naming `acr_values`/`max_age` → the client re-authorizes asking
 * for those. Every link is a field read off a response, so this is the FAPI class end to end, and the
 * last link is the one that matters: **an ACR asked for as a preference is not enforced.** It has to go
 * in `claims` as `essential: true`, or the server may satisfy the request without satisfying the
 * requirement — which is precisely what `checkStepUpRequirements` refuses to fake on the server side.
 *
 * The error path is also where a real defect lived. `JSON.parse(err)` — `any` — had its `error` read
 * off it and the whole object handed to `setChallenge`, so `StepUpChallenge` described a shape nothing
 * verified, and on this deployment the error string is sometimes an HTML page.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

/** What Authlete's introspection answers when the token's authentication is not strong enough. */
const CHALLENGE = JSON.stringify({
  error: 'insufficient_user_authentication',
  error_description: 'The token does not meet the ACR requirement.',
  acr_values: 'urn:mace:incommon:iap:silver urn:mace:incommon:iap:gold',
  max_age: '300',
  acr: 'pwd',
});

describe('StepUpSection — the introspection that asks for requirements', () => {
  it('offers nothing without a token, and says where to get one', () => {
    mountSection(<StepUpSection />);
    expect(screen.getByText(/No access token available/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Introspect with Requirements/i }),
    ).not.toBeInTheDocument();
  });

  it('sends the token, the admin credential and the required ACR', async () => {
    seedTokens({ access_token: 'at-stepup-01' });
    const spy = vi.spyOn(tokenService, 'introspection').mockResolvedValue({ active: true });
    mountSection(<StepUpSection />);
    fillAdminCredentials();

    fill(/Required ACR Values \(space-separated\)/i, 'urn:mace:incommon:iap:gold');
    press(/Introspect with Requirements/i);

    const args = await expectCall(spy, 'the Introspect with Requirements button');
    expectSends(args, 'at-stepup-01', 'the token whose authentication strength is in question');
    expectSends(args, 'mgmt-id', 'RFC 7662 §2.1 requires the endpoint be protected');
    expectSends(
      args,
      'urn:mace:incommon:iap:gold',
      'the requirement the resource server is asserting',
    );
  });

  it('sends max_age as a number, and omits it when blank', async () => {
    seedTokens({ access_token: 'at-stepup-01' });
    const spy = vi.spyOn(tokenService, 'introspection').mockResolvedValue({ active: true });
    mountSection(<StepUpSection />);
    fillAdminCredentials();

    press(/Introspect with Requirements/i);
    let args = (await expectCall(spy, 'the Introspect button')) as unknown[];
    expect(
      (args[3] as { maxAge?: number }).maxAge,
      'blank must not become 0 — the Unix epoch',
    ).toBeUndefined();

    spy.mockClear();
    fill(/Max Authentication Age \(seconds\)/i, '300');
    press(/Introspect with Requirements/i);
    args = (await expectCall(spy, 'the Introspect button')) as unknown[];
    expect(args[3]).toMatchObject({ maxAge: 300 });
  });

  it('reports a sufficient token as sufficient, with no challenge panel', async () => {
    seedTokens({ access_token: 'at-stepup-01' });
    vi.spyOn(tokenService, 'introspection').mockResolvedValue({ active: true, acr: 'gold' });
    mountSection(<StepUpSection />);
    fillAdminCredentials();
    press(/Introspect with Requirements/i);

    await expectReadsBack(/"acr": "gold"/, 'the introspection result');
    expect(screen.queryByRole('button', { name: /Re-Authenticate/i })).not.toBeInTheDocument();
  });
});

describe('StepUpSection — the challenge, and what it builds', () => {
  it('reads the challenge fields off the refusal rather than guessing them', async () => {
    seedTokens({ access_token: 'at-stepup-01' });
    vi.spyOn(tokenService, 'introspection').mockRejectedValue(new Error(CHALLENGE));
    mountSection(<StepUpSection />);
    fillAdminCredentials();
    press(/Introspect with Requirements/i);

    // Each of these is a separate member read off the challenge; a rename shows as a missing line.
    await expectReadsBack(/urn:mace:incommon:iap:silver/, 'the acr_values the resource requires');
    await expectReadsBack(/300/, 'the max_age the resource requires');
  });

  /**
   * **The assertion this section exists for.** `acr_values` on an authorization request is a
   * *preference*: OIDC Core makes it a voluntary claim, and the server may issue a token without
   * satisfying it. Asking as an **essential** claim is what turns it into a requirement — and it is the
   * same distinction `utils/step-up.ts` enforces on the server, where an unknown `acr` does not satisfy
   * an essential request.
   */
  it('asks for the ACR as an essential claim, not as a preference', async () => {
    seedTokens({ access_token: 'at-stepup-01' });
    vi.spyOn(tokenService, 'introspection').mockRejectedValue(new Error(CHALLENGE));
    mountSection(<StepUpSection />);
    fillAdminCredentials();
    press(/Introspect with Requirements/i);

    const link = await screen.findByRole('link', { name: /Re-Authenticate with Required ACR/i });
    const url = new URL(link.getAttribute('href')!);

    const claims = JSON.parse(url.searchParams.get('claims')!) as {
      id_token: { acr: { essential: boolean; values: string[] } };
    };
    expect(claims.id_token.acr.essential, 'a voluntary acr_values may simply be ignored').toBe(
      true,
    );
    expect(claims.id_token.acr.values).toEqual([
      'urn:mace:incommon:iap:silver',
      'urn:mace:incommon:iap:gold',
    ]);
  });

  it('carries max_age and prompt=login, so a cached session cannot satisfy the step-up', async () => {
    seedTokens({ access_token: 'at-stepup-01' });
    vi.spyOn(tokenService, 'introspection').mockRejectedValue(new Error(CHALLENGE));
    mountSection(<StepUpSection />);
    fillAdminCredentials();
    press(/Introspect with Requirements/i);

    const link = await screen.findByRole('link', { name: /Re-Authenticate with Required ACR/i });
    const params = new URL(link.getAttribute('href')!).searchParams;
    expect(params.get('max_age')).toBe('300');
    // Without `prompt=login` the OP may reuse the existing authentication event, which is the one thing
    // a step-up must not accept — the point is a *fresh* stronger authentication.
    expect(params.get('prompt')).toBe('login');
    expect(params.get('response_type')).toBe('code');
    expect(params.get('state'), 'RFC 9207 mix-up defence needs one').toBeTruthy();
  });

  /**
   * **An error that is not a challenge must not become one.** The parse used to be `JSON.parse(err)`
   * with no checking, and on this deployment the error string is sometimes an HTML page — so a 500
   * could have produced a challenge panel describing requirements nobody stated.
   */
  it('does not manufacture a challenge from an unrelated failure', async () => {
    seedTokens({ access_token: 'at-stepup-01' });
    vi.spyOn(tokenService, 'introspection').mockRejectedValue(
      new Error('<!doctype html><html><body>502 Bad Gateway</body></html>'),
    );
    mountSection(<StepUpSection />);
    fillAdminCredentials();
    press(/Introspect with Requirements/i);

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Re-Authenticate/i })).not.toBeInTheDocument(),
    );
    // The absence of the re-authorization link is the assertion. `insufficient_user_authentication`
    // itself is unusable as one: it appears in this section's own explanatory copy, which is exactly
    // the sort of near-miss that makes a text-presence check look like it proved something.
    expect(
      screen.queryByText(/Required ACR Values from challenge|acr_values:/i),
    ).not.toBeInTheDocument();
  });

  it('does not treat a plain 401 as a step-up requirement', async () => {
    seedTokens({ access_token: 'at-stepup-01' });
    vi.spyOn(tokenService, 'introspection').mockRejectedValue(
      new Error(
        '{"error":"invalid_client","error_description":"Basic authentication is required."}',
      ),
    );
    mountSection(<StepUpSection />);
    fillAdminCredentials();
    press(/Introspect with Requirements/i);

    // The credential is wrong; the token's authentication strength is not in question at all.
    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Re-Authenticate/i })).not.toBeInTheDocument();
  });
});
