import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { TokenRequestPanel } from '@/components/auth/TokenRequestPanel';
import { TOKEN_PARAMS, tokenParamsFor } from '@/data/tokenParams';

/**
 * The teaching surface for `POST /api/token`, which had none.
 *
 * The authorization request has 24 documented parameters, a live URL and a raw editor. Its counterpart
 * had no preview, no parameter table and no explanation — over the one exchange where PKCE is *proven*
 * rather than asserted, where client authentication happens, and where four of the six commonest OAuth
 * errors occur.
 */

afterEach(cleanup);

const PUBLIC_PKCE = {
  grant_type: 'authorization_code',
  code: 'abcdefghijklmnop',
  redirect_uri: 'http://localhost:3001/callback',
  client_id: '4277838306',
  code_verifier: 'v'.repeat(43),
};

describe('tokenParamsFor', () => {
  it('sends five parameters for a public client using PKCE', () => {
    const names = tokenParamsFor({ pkce: true, auth: 'none' }).map((p) => p.name);
    expect(names).toEqual(['grant_type', 'code', 'redirect_uri', 'client_id', 'code_verifier']);
  });

  it('adds the body secret for a client_secret_post client', () => {
    const names = tokenParamsFor({ pkce: true, auth: 'secret' }).map((p) => p.name);
    expect(names).toContain('client_secret');
    expect(names).not.toContain('client_assertion');
  });

  it('adds both assertion parameters for private_key_jwt, and no secret', () => {
    const names = tokenParamsFor({ pkce: true, auth: 'assertion' }).map((p) => p.name);
    expect(names).toContain('client_assertion_type');
    expect(names).toContain('client_assertion');
    expect(names).not.toContain('client_secret');
  });

  it('omits code_verifier when PKCE was not used', () => {
    const names = tokenParamsFor({ pkce: false, auth: 'none' }).map((p) => p.name);
    expect(names).not.toContain('code_verifier');
  });
});

describe('every parameter carries all four things the audit asked for', () => {
  it.each(TOKEN_PARAMS.map((p) => [p.name, p] as const))(
    '%s has a citation, a conformance word, a note and a failure mode',
    (_name, spec) => {
      // A citation with a section number, not just a document name — the section is the part a reader
      // needs in order to check the claim.
      expect(spec.spec).toMatch(/(RFC \d{4}|OIDC|draft)/);
      expect(spec.spec).toMatch(/§/);
      expect(spec.requirement.length).toBeGreaterThan(0);
      // The failure mode is the half that was entirely absent before.
      expect(spec.failure.length).toBeGreaterThan(40);
      expect(spec.note.length).toBeGreaterThan(40);
    },
  );
});

describe('TokenRequestPanel', () => {
  it('shows the method, endpoint and the body that was sent', () => {
    render(<TokenRequestPanel body={PUBLIC_PKCE} endpoint="http://localhost:3000/api/token" />);
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:3000/api/token')).toBeInTheDocument();
    expect(screen.getByText(/grant_type=authorization_code/)).toBeInTheDocument();
  });

  it('explains each parameter only when asked, so the panel does not drown the page', () => {
    render(<TokenRequestPanel body={PUBLIC_PKCE} endpoint="/api/token" />);
    expect(screen.queryByText(/what PKCE is for|makes PKCE work/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /What each of these 5 parameters does/i }));
    expect(screen.getByText(/makes PKCE work/i)).toBeInTheDocument();
  });

  it('cites RFC 7636 §4.6 for the PKCE mismatch, which is the failure PKCE exists to cause', () => {
    render(<TokenRequestPanel body={PUBLIC_PKCE} endpoint="/api/token" />);
    fireEvent.click(screen.getByRole('button', { name: /What each of these/i }));
    expect(screen.getByText(/if the values are not equal/i)).toBeInTheDocument();
    expect(screen.getByText(/PKCE doing its job, not a bug/i)).toBeInTheDocument();
  });

  it('quotes the conditional conformance wording rather than flattening it to REQUIRED', () => {
    render(<TokenRequestPanel body={PUBLIC_PKCE} endpoint="/api/token" />);
    fireEvent.click(screen.getByRole('button', { name: /What each of these/i }));
    // RFC 6749 §4.1.3 makes both of these conditional, and the condition is what people get wrong.
    expect(
      screen.getByText(/REQUIRED, if the `redirect_uri` parameter was included/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/REQUIRED, if the client is not authenticating/i)).toBeInTheDocument();
  });

  /**
   * The panel renders on a failed exchange too, so it must not print the credentials that failed.
   * `RequestBuilder` shows the body verbatim by design — this table is a second surface, and a
   * screenshot of an explanation is a likelier thing to share than a cURL command.
   */
  it('names credential parameters without printing their values', () => {
    render(
      <TokenRequestPanel
        body={{ ...PUBLIC_PKCE, client_secret: 'super-secret-value-here' }}
        endpoint="/api/token"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /What each of these/i }));

    expect(screen.getByText('client_secret')).toBeInTheDocument();
    const table = screen.getByText('client_secret').closest('div')?.parentElement?.parentElement;
    expect(table?.textContent).not.toContain('super-secret-value-here');
  });

  it('reports a required parameter the request did not carry', () => {
    const withoutRedirect: Record<string, string> = { ...PUBLIC_PKCE };
    delete withoutRedirect.redirect_uri;
    render(<TokenRequestPanel body={withoutRedirect} endpoint="/api/token" />);
    expect(screen.getByText(/carried no/i)).toBeInTheDocument();
    expect(screen.getByText(/RFC 6749 §4.1.3 requires/i)).toBeInTheDocument();
  });

  it('says nothing about missing parameters when the request is complete', () => {
    render(<TokenRequestPanel body={PUBLIC_PKCE} endpoint="/api/token" />);
    expect(screen.queryByText(/carried no/i)).not.toBeInTheDocument();
  });

  it('describes the assertion shape when a signing key rewired the exchange', () => {
    render(
      <TokenRequestPanel
        body={{
          ...PUBLIC_PKCE,
          client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
          client_assertion: 'eyJhbGciOiJFUzI1NiJ9.e30.sig',
        }}
        endpoint="/api/token"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /What each of these 7 parameters does/i }));
    // `getAllByText`, not `getByText`: two parameters legitimately cite `[A157303]` — `client_id`,
    // because a public client must present no credential, and `client_assertion`, because a stored
    // signing key is how one silently starts doing so. Both are the same failure seen from either end.
    expect(screen.getAllByText(/A157303/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/MUST NOT contain more than one JWT/i)).toBeInTheDocument();
  });
});
