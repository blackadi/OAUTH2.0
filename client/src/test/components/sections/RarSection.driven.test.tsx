import { screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RarSection } from '@/components/oidc/RarSection';
import { rarService } from '@/services';
import { getTraces, clearTraces } from '@/services/trace-store';
import {
  mountSection,
  fill,
  press,
  stubNavigation,
  expectCall,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * RAR — the section where the `request_uri` rename was **already** fixed, so this file confirms rather
 * than discovers. That is worth having explicitly.
 *
 * `RarSection` read Authlete's camelCase `requestUri` after T1-11 made `POST /api/par` answer RFC 9126
 * §2.2's body. The value was `undefined`, the guard failed, and — because `data` itself was truthy —
 * **the error branch never ran either**. A button that silently did nothing at all. The lesson recorded
 * at the time was to consume the shared `ParSuccessResponse` type rather than restate the shape in a
 * local cast, and `FapiSection` then turned out to have the same bug via exactly that route.
 *
 * So the assertions here are: the specification's field is what the redirect carries, and a 201 that
 * genuinely lacks it produces a **message** rather than silence — which is the half the original fix
 * added and which no test covered.
 */

beforeEach(() => {
  resetSectionState();
  clearTraces();
});
afterEach(cleanup);

const PAR_201 = { expires_in: 600, request_uri: 'urn:ietf:params:oauth:request_uri:rar-driven-01' };

describe('RarSection — the authorization_details payload', () => {
  it('sends the RAR document as a parameter, re-serialised from what was typed', async () => {
    const nav = stubNavigation();
    mountSection(<RarSection />);

    fill(/^Client ID$/i, '1523514379');
    press(/Authorize with RAR/i);

    await waitFor(() => expect(nav.href).not.toBe(''));
    const details = new URL(nav.href).searchParams.get('authorization_details');
    expect(details, 'RFC 9396 §2 — the whole point of the section').toBeTruthy();
    const parsed = JSON.parse(details!) as { type: string }[];
    // Re-serialised, so the pretty-printed textarea content does not travel with its whitespace.
    expect(parsed[0].type).toBe('payment_initiation');
    expect(details).not.toContain('\n');
  });

  it('refuses to send when the RAR JSON does not parse', () => {
    mountSection(<RarSection />);
    fill(/authorization_details \(JSON array\)/i, '[{not json');

    // Each object requires a `type` the service knows; a malformed document earns `[A249302]`. Better
    // to say so locally than to spend a round trip finding out.
    expect(screen.getByRole('button', { name: /Authorize with RAR/i })).toBeDisabled();
    expect(screen.getByText(/Invalid JSON|not valid/i)).toBeInTheDocument();
  });

  it('carries the scope and redirect URI the user set', async () => {
    const nav = stubNavigation();
    mountSection(<RarSection />);

    fill(/^Scope$/i, 'openid payments');
    fill(/Redirect URI/i, 'http://localhost:3001/cb2');
    fill(/^Client ID$/i, '1523514379');
    press(/Authorize with RAR/i);

    await waitFor(() => expect(nav.href).not.toBe(''));
    const params = new URL(nav.href).searchParams;
    expect(params.get('scope')).toBe('openid payments');
    expect(params.get('redirect_uri')).toBe('http://localhost:3001/cb2');
    expect(params.get('client_id')).toBe('1523514379');
  });
});

describe('RarSection — PAR, and the field the redirect must carry', () => {
  it('pushes through PAR when the box is ticked, instead of going direct', async () => {
    stubNavigation();
    const spy = vi.spyOn(rarService, 'pushAuthorization').mockResolvedValue(PAR_201);
    mountSection(<RarSection />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Use PAR/i }));
    fill(/^Client ID$/i, '1523514379');
    press(/Push PAR \+ Authorize/i);

    const [body] = (await expectCall(spy, 'the Push PAR + Authorize button')) as [
      { parameters: string; clientId: string },
    ];
    expect(body.clientId).toBe('1523514379');
    expect(new URLSearchParams(body.parameters).get('authorization_details')).toBeTruthy();
  });

  /** The regression, confirmed fixed: the redirect must carry `request_uri`, not `requestUri`. */
  it('redirects with the request_uri the specification names', async () => {
    const nav = stubNavigation();
    vi.spyOn(rarService, 'pushAuthorization').mockResolvedValue(PAR_201);
    mountSection(<RarSection />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Use PAR/i }));
    fill(/^Client ID$/i, '1523514379');
    press(/Push PAR \+ Authorize/i);

    await waitFor(() => expect(nav.href).not.toBe(''));
    expect(new URL(nav.href).searchParams.get('request_uri')).toBe(PAR_201.request_uri);
  });

  /**
   * **The half the original fix added, which nothing covered.** A 201 whose body lacks `request_uri` is
   * exactly what the camelCase bug looked like from inside the handler: `data` truthy, field undefined,
   * so neither the redirect nor the error branch ran. The section must now *say something*.
   */
  it('reports a 201 with no request_uri rather than doing nothing at all', async () => {
    const nav = stubNavigation();
    vi.spyOn(rarService, 'pushAuthorization').mockResolvedValue({ expires_in: 600 });
    mountSection(<RarSection />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Use PAR/i }));
    fill(/^Client ID$/i, '1523514379');
    press(/Push PAR \+ Authorize/i);

    // The response is shown, which is where the reader finds out what actually came back...
    await expectReadsBack(/600/, 'the PAR response body');
    // ...and no navigation happened, because there is nothing to navigate with.
    expect(nav.href, 'a redirect with an undefined request_uri is worse than none').toBe('');
  });

  it('takes the DPoP path with a proof factory when both boxes are ticked', async () => {
    const spy = vi
      .spyOn(rarService, 'pushAuthorizationWithDpop')
      .mockResolvedValue({ data: PAR_201 });
    stubNavigation();
    mountSection(<RarSection />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Use PAR/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Use DPoP/i }));
    fill(/^Client ID$/i, '1523514379');
    press(/Push PAR \+ Authorize/i);

    const [, proofFactory] = (await expectCall(spy, 'the DPoP PAR push')) as [unknown, unknown];
    expect(typeof proofFactory).toBe('function');
  });

  /** The fifth site of the unrecorded-navigation defect — see `navigateTo` in `trace-store.ts`. */
  it('records the front-channel hop on both routes out of this section', async () => {
    stubNavigation();
    mountSection(<RarSection />);
    fill(/^Client ID$/i, '1523514379');
    press(/Authorize with RAR/i);

    await waitFor(() => {
      const hop = getTraces().find((t) => t.navigation && t.url.includes('/api/authorization'));
      expect(hop, 'the browser left and nothing recorded it').toBeDefined();
      expect(hop!.direction).toBe('outbound');
    });
  });

  it('explains a refusal instead of printing it raw', async () => {
    vi.spyOn(rarService, 'pushAuthorization').mockRejectedValue(
      new Error(
        '{"error":"invalid_authorization_details","error_description":"[A249302] unknown type."}',
      ),
    );
    mountSection(<RarSection />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Use PAR/i }));
    fill(/^Client ID$/i, '1523514379');
    press(/Push PAR \+ Authorize/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
    await expectReadsBack(/A249302/, 'the vendor code for an unknown RAR type');
  });
});
