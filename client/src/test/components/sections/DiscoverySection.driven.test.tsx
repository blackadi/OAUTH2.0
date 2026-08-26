import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DiscoverySection } from '@/components/oidc/DiscoverySection';
import { tokenService } from '@/services';
import {
  mountSection,
  press,
  expectCall,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * Discovery — two public `GET`s, and the section where **reading the wrong document proves nothing**.
 *
 * The repo's own hard-won rule, from 2026-08-14: the deployment turned out to be pointed at a
 * *different* Authlete service than the entire RFC audit had been conducted against, and three signals
 * gave it away — the `issuer` differed by a trailing slash, the endpoint hosts differed, and the member
 * count was 59 against 62. `GET /api/{serviceId}/service/configuration` and the document served at
 * `/.well-known/openid-configuration` are two different reads, and **reading either alone proves
 * nothing about the other.** This section fetches the live one, which is the half a user can check.
 *
 * So what is worth pinning here is small and specific: two operations that must not collide, and a
 * response rendered under the right label — because a JWKS displayed as "Discovery Document" is exactly
 * the sort of mislabelling that makes somebody trust the wrong artefact.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

/** Trimmed to the members that carry meaning for the rest of this app. */
const DISCOVERY = {
  issuer: 'http://localhost:3000',
  authorization_endpoint: 'http://localhost:3000/api/authorization',
  token_endpoint: 'http://localhost:3000/api/token',
  dpop_signing_alg_values_supported: ['ES256', 'RS256'],
  backchannel_logout_supported: true,
  code_challenge_methods_supported: ['S256', 'plain'],
};

const JWKS = {
  keys: [{ kty: 'RSA', kid: 'rsa-1', use: 'sig', alg: 'RS256', n: 'xxx', e: 'AQAB' }],
};

describe('DiscoverySection', () => {
  it('fetches the discovery document with no credential, because it is public', async () => {
    const spy = vi.spyOn(tokenService, 'discovery').mockResolvedValue(DISCOVERY);
    mountSection(<DiscoverySection />);

    press(/Fetch OpenID Configuration/i);

    const args = await expectCall(spy, 'the Fetch OpenID Configuration button');
    expect(args, 'RFC 8414 metadata is public; a credential here would be the bug').toHaveLength(0);
    await expectReadsBack(/http:\/\/localhost:3000/, 'the issuer from the live document');
  });

  it('renders it under the Discovery Document label, not the JWKS one', async () => {
    vi.spyOn(tokenService, 'discovery').mockResolvedValue(DISCOVERY);
    mountSection(<DiscoverySection />);
    press(/Fetch OpenID Configuration/i);

    // The label follows the operation, and a JWKS shown as a discovery document is how somebody comes
    // to trust the wrong artefact.
    expect(await screen.findByText(/Discovery Document/i)).toBeInTheDocument();
    expect(screen.queryByText(/^JWKS$/)).not.toBeInTheDocument();
  });

  it('fetches the JWKS and labels it as such', async () => {
    const spy = vi.spyOn(tokenService, 'getJwks').mockResolvedValue(JWKS);
    mountSection(<DiscoverySection />);

    press(/Fetch JWKS/i);
    await expectCall(spy, 'the Fetch JWKS button');

    expect(await screen.findByText(/^JWKS$/)).toBeInTheDocument();
    await expectReadsBack(/rsa-1/, 'the signing key id, which is what JWT verification looks up');
  });

  /**
   * One `useDiscriminatedAsyncCall` serves both, and `loading` is a **label** rather than a boolean
   * precisely so two buttons cannot both spin. Driving it is the only way to see that.
   */
  it('replaces the previous result rather than showing two documents at once', async () => {
    vi.spyOn(tokenService, 'discovery').mockResolvedValue(DISCOVERY);
    vi.spyOn(tokenService, 'getJwks').mockResolvedValue(JWKS);
    mountSection(<DiscoverySection />);

    press(/Fetch OpenID Configuration/i);
    await expectReadsBack(/authorization_endpoint/, 'the discovery document');

    press(/Fetch JWKS/i);
    await expectReadsBack(/rsa-1/, 'the JWKS');
    await waitFor(() =>
      expect(
        screen.queryByText(/authorization_endpoint/),
        'the previous document must not linger beside the new one',
      ).not.toBeInTheDocument(),
    );
  });

  it('explains a failure instead of printing it raw', async () => {
    vi.spyOn(tokenService, 'discovery').mockRejectedValue(
      new Error('502 Bad Gateway · the authorization server is unreachable'),
    );
    mountSection(<DiscoverySection />);
    press(/Fetch OpenID Configuration/i);

    // A bare 5xx has no error code to decode, so `statusHint` is the only thing that can say anything —
    // the path that was dead until `decodeError` learned to read the status off the message.
    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
  });
});
