import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { JwsScratchpad } from '@/components/ui/JwsScratchpad';
import { TokenProvider } from '@/context/TokenContext';
import { __resetJwksCache } from '@/components/ui/JwtInspector';

const b64 = (o: unknown) =>
  btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const ID_TOKEN = [
  b64({ alg: 'ES256', kid: '1' }),
  b64({ iss: 'https://as.example', sub: 'admin', aud: '4277838306' }),
  'c2lnbmF0dXJl',
].join('.');

beforeEach(() => {
  sessionStorage.clear();
  __resetJwksCache();
});
afterEach(cleanup);

function renderPad(tokens?: Record<string, unknown>) {
  if (tokens) sessionStorage.setItem('token_response', JSON.stringify(tokens));
  render(
    <TokenProvider>
      <JwsScratchpad />
    </TokenProvider>,
  );
}

describe('the empty state', () => {
  it('explains that an opaque token is a correct answer, not a failure', () => {
    renderPad();
    // The alternative — an empty pane, or "invalid token" — teaches that an opaque access token is
    // broken. This deployment issues opaque tokens by default, so that would be wrong on the common path.
    expect(screen.getByText(/An opaque access token has no header/)).toBeInTheDocument();
    // `Claims` is the inspector's own section label, rendered once and uppercased by CSS rather than
    // in the DOM — so the assertion has to match the real text node, not what the screen shows.
    expect(screen.queryByText('Claims')).toBeNull();
  });

  it('offers no fill buttons when there is nothing to fill from', () => {
    renderPad();
    expect(screen.queryByRole('button', { name: 'Use ID token' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use access token' })).toBeNull();
  });
});

describe('normalising what people actually paste', () => {
  /**
   * Every case here is a real shape a JWS arrives in, and every one of them decodes as "not a JWS"
   * without the normalisation. A debugger that answers *"expected 3 dot-separated parts, got 1"* about
   * `Bearer eyJ…` has told the truth and taught nothing, so the pad fixes the paste rather than blaming
   * it.
   */
  it.each([
    ['as issued', ID_TOKEN],
    ['with the Authorization scheme attached', `Bearer ${ID_TOKEN}`],
    ['with the DPoP scheme attached', `DPoP ${ID_TOKEN}`],
    ['in double quotes, as JSON or a shell variable', `"${ID_TOKEN}"`],
    ['wrapped across lines, as from a log', `${ID_TOKEN.slice(0, 30)}\n${ID_TOKEN.slice(30)}`],
    ['with leading and trailing whitespace', `\n  ${ID_TOKEN}  \n`],
  ])('decodes a token pasted %s', async (_label, pasted) => {
    renderPad();
    // `paste`, not `type`: it is one event rather than several hundred, and it is also the gesture
    // every one of these shapes actually arrives by.
    screen.getByLabelText(/Paste any JWS/).focus();
    await userEvent.paste(pasted);
    expect(await screen.findByText('Claims')).toBeInTheDocument();
    expect(screen.getByText('iss')).toBeInTheDocument();
    expect(screen.getByText('https://as.example')).toBeInTheDocument();
  });

  it('still reports genuinely undecodable input as undecodable', async () => {
    renderPad();
    screen.getByLabelText(/Paste any JWS/).focus();
    await userEvent.paste('not-a-token');
    expect(await screen.findByText('Not a decodable JWT')).toBeInTheDocument();
  });
});

describe('filling from the session', () => {
  it('offers only the tokens that are actually held', () => {
    renderPad({ access_token: 'opaque-value', token_type: 'Bearer' });
    expect(screen.getByRole('button', { name: 'Use access token' })).toBeInTheDocument();
    // No `id_token` in the response, so no button — a button that fills the box with `undefined` is
    // worse than an absent one.
    expect(screen.queryByRole('button', { name: 'Use ID token' })).toBeNull();
  });

  it('fills the box with the exact token, which is the point of the button', async () => {
    renderPad({ id_token: ID_TOKEN, token_type: 'Bearer' });
    await userEvent.click(screen.getByRole('button', { name: 'Use ID token' }));
    expect(screen.getByLabelText(/Paste any JWS/)).toHaveValue(ID_TOKEN);
    /*
      A hand-copied token that lost its last characters reports as *undecodable*, which reads as a defect
      in the token rather than in the copy. That is the failure this button exists to remove, so the
      assertion is on the whole value rather than on "something was filled in".
    */
    expect(await screen.findByText('Claims')).toBeInTheDocument();
  });

  it('clears back to the empty state', async () => {
    renderPad({ id_token: ID_TOKEN, token_type: 'Bearer' });
    await userEvent.click(screen.getByRole('button', { name: 'Use ID token' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText(/Paste any JWS/)).toHaveValue('');
    expect(screen.getByText(/An opaque access token has no header/)).toBeInTheDocument();
  });
});
