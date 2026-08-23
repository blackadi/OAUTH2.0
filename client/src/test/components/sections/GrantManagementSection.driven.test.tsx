import { screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GrantManagementSection } from '@/components/admin/GrantManagementSection';
import { grantService } from '@/services';
import {
  mountSection,
  fill,
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
 * Grant Management — where presenting the *wrong scheme* is the dead flow.
 *
 * `/api/gm` is a protected resource. RFC 9449 §7.1 gives a DPoP-bound token no bearer option, and
 * Authlete refuses the downgrade with `[A281305]`. This section sent `Bearer` unconditionally, so a
 * token from Grant Flows — which used to be sender-constrained whether you asked or not — could not be
 * used here at all. The button was enabled, the request went out, and the server said no.
 *
 * That is the JAR class wearing different clothes: **the call must carry what the server requires**,
 * and here the requirement is a proof rather than a credential.
 *
 * The scheme itself is chosen inside `grant.service.ts` from the presence of `dpopProof`, so what this
 * layer can assert is that the section *hands it over*. The service's own unit test owns the header.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

/** A `/api/gm/:grantId` query response — the shape Grant Management for OAuth 2.0 defines. */
const GRANT = {
  grantId: 'grant-77',
  grant: {
    scopes: [{ scope: 'openid', resource: [] }],
    claims: ['name', 'email'],
  },
};

describe('GrantManagementSection — presenting the token the way the resource requires', () => {
  it('carries the access token and the grant id on a query', async () => {
    const spy = vi.spyOn(grantService, 'queryGrant').mockResolvedValue(GRANT);
    mountSection(<GrantManagementSection />);

    fill(/Access Token/i, 'at-plain-01');
    fill(/Grant ID/i, 'grant-77');
    press(/^Query$/i);

    const args = await expectCall(spy, 'the Query button');
    expectSends(args, 'at-plain-01', 'the token is what /api/gm authenticates');
    expectSends(
      args,
      'grant-77',
      'requireGrantOwnership compares this id against the token’s grant',
    );
  });

  it('refuses to send without both a token and a grant id', () => {
    const spy = vi.spyOn(grantService, 'queryGrant');
    mountSection(<GrantManagementSection />);
    fill(/Access Token/i, 'at-plain-01');
    // No grant id: there is nothing to query, and a 404 would teach nothing.

    expect(screen.getByRole('button', { name: /^Query$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Revoke$/i })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  /**
   * The regression itself: a DPoP-bound token must not be presented as a bearer token.
   *
   * `isDpopBound` comes from `token_type`, compared case-insensitively per RFC 9110 §11.1, and the
   * checkbox defaults to it — so seeding a bound token plus a key is exactly the state a user reaches
   * after running the headline flow with DPoP on.
   */
  it('hands the service a proof factory when the token in hand is DPoP-bound', async () => {
    seedTokens({ access_token: 'at-bound-01', token_type: 'DPoP' });
    seedDpopKey();
    const spy = vi.spyOn(grantService, 'queryGrant').mockResolvedValue(GRANT);
    mountSection(<GrantManagementSection />);

    fill(/Grant ID/i, 'grant-77');
    press(/^Query$/i);

    const [auth] = (await expectCall(spy, 'the Query button')) as [
      { accessToken: string; dpopProof?: unknown },
    ];
    expect(
      typeof auth.dpopProof,
      'a DPoP-bound token has no bearer option (RFC 9449 §7.1); Authlete refuses the downgrade with [A281305]',
    ).toBe('function');
    // A **factory**, not a proof: `dpopRequest` re-signs on a `use_dpop_nonce` refusal, and the nonce
    // lives inside the signature. Passing a finished string would make the retry unable to change it.
    expect(auth.accessToken).toBe('at-bound-01');
  });

  it('sends no proof for an unbound token, so the bearer path stays reachable', async () => {
    seedTokens({ access_token: 'at-plain-01', token_type: 'Bearer' });
    seedDpopKey();
    const spy = vi.spyOn(grantService, 'queryGrant').mockResolvedValue(GRANT);
    mountSection(<GrantManagementSection />);

    fill(/Grant ID/i, 'grant-77');
    press(/^Query$/i);

    const [auth] = (await expectCall(spy, 'the Query button')) as [{ dpopProof?: unknown }];
    expect(auth.dpopProof, 'nothing to prove — the token has no `cnf`').toBeUndefined();
  });

  /**
   * The override exists so that presenting the *wrong* scheme on purpose and reading the refusal is
   * possible — this is a debugger. What must not happen is the checkbox being decorative.
   */
  it('honours the override, so a deliberate downgrade can be observed', async () => {
    seedTokens({ access_token: 'at-bound-01', token_type: 'DPoP' });
    seedDpopKey();
    const spy = vi.spyOn(grantService, 'queryGrant').mockResolvedValue(GRANT);
    mountSection(<GrantManagementSection />);

    fill(/Grant ID/i, 'grant-77');
    fireEvent.click(screen.getByRole('checkbox'));
    press(/^Query$/i);

    const [auth] = (await expectCall(spy, 'the Query button')) as [{ dpopProof?: unknown }];
    expect(
      auth.dpopProof,
      'unchecking must actually send Bearer, or the refusal is unreachable',
    ).toBeUndefined();
  });

  /**
   * Revoking reaches further than it looks: every access and refresh token issued under the grant dies.
   * The typed confirmation is the finding, so driving through it is the assertion.
   */
  it('makes a revoke pass through a typed confirmation before it reaches the server', async () => {
    const spy = vi.spyOn(grantService, 'revokeGrant').mockResolvedValue(null);
    mountSection(<GrantManagementSection />);

    fill(/Access Token/i, 'at-plain-01');
    fill(/Grant ID/i, 'grant-77');
    press(/^Revoke$/i);

    expect(spy, 'the dialog must open before anything is revoked').not.toHaveBeenCalled();
    await confirmDialog('grant-77');

    const args = await expectCall(spy, 'the confirmed revoke');
    expectSends(args, 'grant-77', 'the grant the user typed back is the one revoked');
  });

  it('renders the grant the server returned', async () => {
    vi.spyOn(grantService, 'queryGrant').mockResolvedValue(GRANT);
    mountSection(<GrantManagementSection />);
    fill(/Access Token/i, 'at-plain-01');
    fill(/Grant ID/i, 'grant-77');
    press(/^Query$/i);

    await expectReadsBack(/grant-77/, 'the grant id in the response body');
    await expectReadsBack(/openid/, 'the scopes the grant covers');
  });

  /**
   * A 403 and a 401 mean entirely different things here — `requireGrantOwnership` runs *before*
   * Authlete's `/gm` API, so 403 is "not your grant" and 401 is "the token itself is bad". Both used to
   * arrive as bare red text.
   */
  it('explains a refusal instead of printing it raw', async () => {
    vi.spyOn(grantService, 'queryGrant').mockRejectedValue(
      new Error('{"error":"invalid_token","error_description":"[A281305] DPoP proof required."}'),
    );
    mountSection(<GrantManagementSection />);
    fill(/Access Token/i, 'at-plain-01');
    fill(/Grant ID/i, 'grant-77');
    press(/^Query$/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
    // Twice, and exactly twice: `ErrorExplainer`'s rule is that the raw text is never replaced, only
    // accompanied — once verbatim, once as the decoded badge.
    expect(screen.getAllByText(/A281305/)).toHaveLength(2);
  });
});
