import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { TokenExchangeSection } from '@/components/oidc/TokenExchangeSection';
import { TokenProvider } from '@/context/TokenContext';
import { CredentialProvider } from '@/context/CredentialContext';
import { tokenExchangeService } from '@/services';
import { clearTraces } from '@/services/trace-store';

/**
 * RFC 8693 Token Exchange — the one flow the debugger could not send.
 *
 * The server implements the grant, `token.controller.ts` has a `TOKEN_EXCHANGE` branch, and Module 06
 * teaches it through three *deliberate* defects. The only trace of it in the client was a dropdown
 * option in Token Management, so the curriculum had a lab for a flow the tool could not exercise.
 *
 * The tests worth having here are about the two things this section has to get right: the conditional
 * `actor_token_type` rule, which is one of the few genuinely conditional MUST NOTs in OAuth; and the
 * reporting of the deliberate defects **as deliberate**, because a debugger that worked around them
 * would teach the opposite of the lesson and one that called them bugs would be wrong.
 */

beforeEach(() => {
  clearTraces();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount() {
  return render(
    <MemoryRouter>
      <TokenProvider>
        <CredentialProvider>
          <TokenExchangeSection />
        </CredentialProvider>
      </TokenProvider>
    </MemoryRouter>,
  );
}

/**
 * The form body of the first call.
 *
 * Typed from the service's own signature rather than `ReturnType<typeof vi.spyOn>`, which is `any` and
 * would make every assertion below an unchecked read — in the file whose whole job is asserting what
 * goes on the wire.
 */
type ExchangeSpy = MockInstance<typeof tokenExchangeService.exchange>;

function bodyOf(spy: ExchangeSpy): Record<string, string> {
  return spy.mock.calls[0]?.[0] ?? {};
}

describe('the request shape', () => {
  it('sends the RFC 8693 grant type to the ordinary token endpoint', async () => {
    const spy = vi
      .spyOn(tokenExchangeService, 'exchange')
      .mockResolvedValue({ access_token: 'new-at' });
    mount();

    fireEvent.change(screen.getByLabelText(/subject_token \(REQUIRED/i), {
      target: { value: 'subject-at' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Exchange token/i }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(bodyOf(spy).grant_type).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
    expect(bodyOf(spy).subject_token).toBe('subject-at');
    expect(bodyOf(spy).subject_token_type).toBe('urn:ietf:params:oauth:token-type:access_token');
  });

  it('refuses to send without a subject token, which §2.1 makes REQUIRED', () => {
    const spy = vi.spyOn(tokenExchangeService, 'exchange');
    mount();
    expect(screen.getByRole('button', { name: /Exchange token/i })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  /**
   * §2.1: `actor_token_type` is *"REQUIRED when the `actor_token` parameter is present in the request
   * but MUST NOT be included otherwise"*. Deriving it means the invalid combination cannot be sent —
   * which is the point of a builder over a raw form.
   */
  it('omits actor_token_type entirely when there is no actor token', async () => {
    const spy = vi
      .spyOn(tokenExchangeService, 'exchange')
      .mockResolvedValue({ access_token: 'new-at' });
    mount();
    fireEvent.change(screen.getByLabelText(/subject_token \(REQUIRED/i), {
      target: { value: 'subject-at' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Exchange token/i }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(bodyOf(spy)).not.toHaveProperty('actor_token');
    expect(bodyOf(spy)).not.toHaveProperty('actor_token_type');
  });

  it('adds actor_token_type only once an actor token is present', async () => {
    const spy = vi
      .spyOn(tokenExchangeService, 'exchange')
      .mockResolvedValue({ access_token: 'new-at' });
    mount();

    // The control does not even exist until the actor token does.
    expect(screen.queryByLabelText(/actor_token_type/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/subject_token \(REQUIRED/i), {
      target: { value: 'subject-at' },
    });
    fireEvent.change(screen.getByLabelText(/^actor_token \(OPTIONAL/i), {
      target: { value: 'actor-at' },
    });
    expect(screen.getByLabelText(/actor_token_type/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Exchange token/i }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(bodyOf(spy).actor_token).toBe('actor-at');
    expect(bodyOf(spy).actor_token_type).toBe('urn:ietf:params:oauth:token-type:access_token');
  });

  it('omits the optional parameters that were left blank, rather than sending them empty', async () => {
    const spy = vi
      .spyOn(tokenExchangeService, 'exchange')
      .mockResolvedValue({ access_token: 'new-at' });
    mount();
    fireEvent.change(screen.getByLabelText(/subject_token \(REQUIRED/i), {
      target: { value: 'subject-at' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Exchange token/i }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    for (const key of ['audience', 'resource', 'scope', 'requested_token_type']) {
      expect(bodyOf(spy)).not.toHaveProperty(key);
    }
  });

  it('explains impersonation against delegation before the form, not after a 400', () => {
    mount();
    expect(
      screen.getByText(/Nothing records that somebody else did the acting/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/acting on behalf of/i)).toBeInTheDocument();
  });
});

/**
 * `AGENTS.md` records three intentional defects in `controllers/token-exchange-response.handler.ts`,
 * each taught by a Module 06 exercise and each locked by a characterization test. Reporting them as
 * intentional is the only honest option: working around them breaks the lab, and calling them bugs is
 * factually wrong.
 */
describe('the deliberate defects are reported as deliberate', () => {
  async function exchangeWith(response: Record<string, unknown>, withActor = false) {
    vi.spyOn(tokenExchangeService, 'exchange').mockResolvedValue(response);
    mount();
    fireEvent.change(screen.getByLabelText(/subject_token \(REQUIRED/i), {
      target: { value: 'subject-at' },
    });
    if (withActor) {
      fireEvent.change(screen.getByLabelText(/^actor_token \(OPTIONAL/i), {
        target: { value: 'actor-at' },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: /Exchange token/i }));
    await screen.findByText(/deliberately non-conformant/i);
  }

  it('names the missing issued_token_type and the exercise that owns it', async () => {
    await exchangeWith({ access_token: 'new-at', token_type: 'Bearer', expires_in: 300 });
    expect(screen.getByText(/issued_token_type is missing/i)).toBeInTheDocument();
    expect(screen.getByText(/Exercise 6a/)).toBeInTheDocument();
    expect(screen.getByText(/RFC 8693 §2.2.1/)).toBeInTheDocument();
  });

  it('flags the non-specification members, and why `subject` is the dangerous one', async () => {
    await exchangeWith({
      access_token: 'new-at',
      issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      token_type: 'Bearer',
      expires_in: 300,
      client_id: '4277838306',
      subject: 'subject-at',
    });
    expect(screen.getByText(/Non-specification members are present/i)).toBeInTheDocument();
    expect(screen.getByText(/live access token in a field/i)).toBeInTheDocument();
    expect(screen.getByText(/Exercise 6c/)).toBeInTheDocument();
  });

  it('reports that a delegation request received impersonation', async () => {
    await exchangeWith(
      {
        access_token: 'new-at',
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        token_type: 'Bearer',
        expires_in: 300,
      },
      true,
    );
    expect(screen.getByText(/The actor token was dropped/i)).toBeInTheDocument();
    // The specific claim, not a loose alternation: the request asked for delegation and got the other
    // thing, and the token carries no record of it.
    expect(screen.getByText(/no record that one party acted for another/i)).toBeInTheDocument();
    expect(screen.getByText(/Exercise 6b/)).toBeInTheDocument();
  });

  it('reports the missing lifetime when the token outlives an hour', async () => {
    await exchangeWith({
      access_token: 'new-at',
      issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      token_type: 'Bearer',
      expires_in: 86400,
    });
    expect(screen.getByText(/No lifetime was requested/i)).toBeInTheDocument();
    expect(screen.getByText(/24 hours/i)).toBeInTheDocument();
  });

  /**
   * Detected from the response rather than assumed, so that if a defect is ever fixed **on purpose**
   * this panel stops claiming it. That is the same reason the server-side characterization test asserts
   * current behaviour rather than correct behaviour.
   */
  it('says nothing when the response is conformant', async () => {
    vi.spyOn(tokenExchangeService, 'exchange').mockResolvedValue({
      access_token: 'new-at',
      issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      token_type: 'Bearer',
      expires_in: 300,
    });
    mount();
    fireEvent.change(screen.getByLabelText(/subject_token \(REQUIRED/i), {
      target: { value: 'subject-at' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Exchange token/i }));

    await screen.findByText(/Token Response/i);
    expect(screen.queryByText(/deliberately non-conformant/i)).not.toBeInTheDocument();
  });
});
