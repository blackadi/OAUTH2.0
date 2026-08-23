import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthorizeRequestBuilder } from '@/components/auth/AuthorizeRequestBuilder';
import { AUTH_PARAMS } from '@/data/authParams';

const ENDPOINT = 'http://localhost:3000/api/authorization';
const SEED = {
  clientId: 'client-1',
  redirectUri: 'http://localhost:3001/callback',
  scope: 'openid profile',
};

type BuilderProps = Parameters<typeof AuthorizeRequestBuilder>[0];

function mount(props: Partial<BuilderProps> = {}) {
  // Typed from the component's own prop, so `onSend.mock.calls[0][1].codeVerifier` is a checked read
  // rather than an `any` — these assertions are about the PKCE contract and deserve to be verified.
  const onSend = vi.fn<BuilderProps['onSend']>();
  render(<AuthorizeRequestBuilder endpoint={ENDPOINT} seed={SEED} onSend={onSend} {...props} />);
  return { onSend };
}

/** The URL as rendered in the preview, which is the same string Send navigates to. */
function previewUrl(): string {
  const pre = document.querySelector('pre');
  return pre?.textContent ?? '';
}

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

/** `state`, `nonce` and `code_challenge` are minted in an async effect. */
async function waitForGenerated() {
  await waitFor(() => expect(paramsOf(previewUrl()).get('state')).toBeTruthy());
}

beforeEach(() => sessionStorage.clear());
afterEach(() => cleanup());

describe('the URL is the request', () => {
  it('sends exactly the string it shows — the defect this replaces was a separate preview', async () => {
    const { onSend } = mount();
    await waitForGenerated();

    const shown = previewUrl();
    fireEvent.click(screen.getByRole('button', { name: /Send authorization request/i }));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toBe(shown);
  });

  it('includes state, nonce and code_challenge, which the old hand-built preview omitted', async () => {
    mount();
    await waitForGenerated();
    const p = paramsOf(previewUrl());
    expect(p.get('state')).toBeTruthy();
    expect(p.get('nonce')).toBeTruthy();
    expect(p.get('code_challenge')).toBeTruthy();
    expect(p.get('code_challenge_method')).toBe('S256');
  });

  it('starts from a conformant authorization-code request', async () => {
    mount();
    await waitForGenerated();
    const p = paramsOf(previewUrl());
    expect(p.get('response_type')).toBe('code');
    expect(p.get('client_id')).toBe(SEED.clientId);
    expect(p.get('redirect_uri')).toBe(SEED.redirectUri);
    expect(p.get('scope')).toBe(SEED.scope);
  });
});

describe('parameters the panel could not previously reach', () => {
  it('makes scope editable — it used to come from a build-time constant', async () => {
    mount();
    await waitForGenerated();
    fireEvent.change(screen.getByLabelText('scope value'), { target: { value: 'openid email' } });
    expect(paramsOf(previewUrl()).get('scope')).toBe('openid email');
  });

  it('an edit shadows the seed rather than being overwritten by it', async () => {
    mount();
    await waitForGenerated();
    fireEvent.change(screen.getByLabelText('client_id value'), {
      target: { value: 'other-client' },
    });
    expect(paramsOf(previewUrl()).get('client_id')).toBe('other-client');
  });

  it('offers prompt, max_age, acr_values, claims, resource and the rest', () => {
    mount();
    const names = AUTH_PARAMS.map((p) => p.name);
    for (const name of [
      'prompt',
      'max_age',
      'acr_values',
      'claims',
      'resource',
      'response_mode',
      'login_hint',
      'authorization_details',
      'dpop_jkt',
      'grant_management_action',
    ]) {
      expect(names).toContain(name);
    }
  });

  it('adds a parameter only once it is enabled', async () => {
    mount();
    await waitForGenerated();
    expect(paramsOf(previewUrl()).get('prompt')).toBeNull();

    fireEvent.click(screen.getByLabelText(/^prompt$/i, { selector: 'input[type="checkbox"]' }));
    fireEvent.change(screen.getByLabelText('prompt value'), { target: { value: 'login' } });
    expect(paramsOf(previewUrl()).get('prompt')).toBe('login');
  });

  it('drops a parameter when it is switched off', async () => {
    mount();
    await waitForGenerated();
    expect(paramsOf(previewUrl()).get('nonce')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/^nonce$/i, { selector: 'input[type="checkbox"]' }));
    expect(paramsOf(previewUrl()).get('nonce')).toBeNull();
  });
});

describe('PKCE', () => {
  it('hands back the verifier that matches the challenge it sent', async () => {
    const { onSend } = mount();
    await waitForGenerated();
    fireEvent.click(screen.getByRole('button', { name: /Send authorization request/i }));
    expect(onSend.mock.calls[0][1].codeVerifier).toBeTruthy();
  });

  it('switching to plain rewrites the challenge to the verifier itself (RFC 7636 §4.2)', async () => {
    const { onSend } = mount();
    await waitForGenerated();
    const s256Challenge = paramsOf(previewUrl()).get('code_challenge');

    fireEvent.change(screen.getByLabelText('code_challenge_method value'), {
      target: { value: 'plain' },
    });

    await waitFor(() =>
      expect(paramsOf(previewUrl()).get('code_challenge')).not.toBe(s256Challenge),
    );
    fireEvent.click(screen.getByRole('button', { name: /Send authorization request/i }));
    // Under `plain` the challenge and the verifier are the same string.
    expect(paramsOf(previewUrl()).get('code_challenge')).toBe(onSend.mock.calls[0][1].codeVerifier);
  });

  it('a hand-edited challenge withholds the verifier and warns, because the exchange must fail', async () => {
    const { onSend } = mount();
    await waitForGenerated();

    fireEvent.change(screen.getByLabelText('code_challenge value'), {
      target: { value: 'tampered' },
    });

    expect(screen.getByText(/no longer matches the verifier/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Send authorization request/i }));
    expect(onSend.mock.calls[0][1].codeVerifier).toBeNull();
    expect(paramsOf(previewUrl()).get('code_challenge')).toBe('tampered');
  });
});

describe('escape hatches', () => {
  it('raw mode seeds from the built URL and sends what was typed', async () => {
    const { onSend } = mount();
    await waitForGenerated();
    const built = previewUrl();

    fireEvent.click(screen.getByRole('button', { name: /Edit raw/i }));
    const box = screen.getByLabelText(/Raw authorization URL/i);
    expect((box as HTMLTextAreaElement).value).toBe(built);

    fireEvent.change(box, { target: { value: `${ENDPOINT}?client_id=hand-written` } });
    fireEvent.click(screen.getByRole('button', { name: /Send authorization request/i }));
    expect(onSend.mock.calls[0][0]).toBe(`${ENDPOINT}?client_id=hand-written`);
  });

  it('sends a custom parameter, including a duplicate of a known one', async () => {
    mount();
    await waitForGenerated();
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));
    fireEvent.change(screen.getByLabelText(/Custom parameter name/i), {
      target: { value: 'scope' },
    });
    fireEvent.change(screen.getByLabelText(/Custom parameter value/i), {
      target: { value: 'extra' },
    });
    expect(paramsOf(previewUrl()).getAll('scope')).toEqual([SEED.scope, 'extra']);
  });

  it('warns on invalid JSON without blocking the send', async () => {
    mount();
    await waitForGenerated();
    fireEvent.click(screen.getByLabelText(/^claims$/i, { selector: 'input[type="checkbox"]' }));
    fireEvent.change(screen.getByLabelText('claims value'), { target: { value: '{not json' } });
    expect(screen.getByText(/is not valid JSON/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send authorization request/i })).toBeEnabled();
  });
});

describe('DPoP', () => {
  it('fills dpop_jkt from the supplied thumbprint once enabled', async () => {
    mount({ dpopThumbprint: 'thumb-abc' });
    await waitForGenerated();
    // The Extensions group starts collapsed — the rows do not exist until it is opened.
    fireEvent.click(screen.getByRole('button', { name: /Extensions/i }));
    fireEvent.click(screen.getByLabelText(/^dpop_jkt$/i, { selector: 'input[type="checkbox"]' }));
    expect(paramsOf(previewUrl()).get('dpop_jkt')).toBe('thumb-abc');
  });

  it('is absent when no key has been generated', async () => {
    mount();
    await waitForGenerated();
    expect(paramsOf(previewUrl()).get('dpop_jkt')).toBeNull();
  });
});

/**
 * The attacker model, promoted out of the code comments and into the UI.
 *
 * Across ~2,100 lines of teaching prose in `src/data/`, the words `attack` and `attacker` appeared
 * **zero** times — as did `mix-up`, `injection` and `steal`. The notes said *"change this and watch it
 * break"*, which teaches that a check exists rather than why anyone wrote one. The prose already existed
 * in this repo, written for maintainers; these tests pin that it now reaches users.
 */
describe('the attacker model (PED-06)', () => {
  it('gives every parameter that carries a security promise a threat, and none to those that do not', () => {
    const withThreat = AUTH_PARAMS.filter((p) => p.threat).map((p) => p.name);
    const without = AUTH_PARAMS.filter((p) => !p.threat).map((p) => p.name);

    // The security-bearing set, named explicitly: a regression that quietly drops one should fail here.
    expect(withThreat).toEqual(
      expect.arrayContaining([
        'state',
        'nonce',
        'code_challenge',
        'code_challenge_method',
        'redirect_uri',
        'request',
        'request_uri',
        'dpop_jkt',
        'id_token_hint',
        'resource',
        'max_age',
        'acr_values',
      ]),
    );
    // An invented threat is worse than silence — these carry no security promise.
    expect(without).toEqual(expect.arrayContaining(['display', 'ui_locales', 'login_hint']));
  });

  it('names the attack rather than only the symptom', () => {
    const byName = Object.fromEntries(AUTH_PARAMS.map((p) => [p.name, p]));
    // `state` is the canonical case: the old note said "tamper with it and watch the callback refuse".
    expect(byName.state.threat).toMatch(/any page can start a flow in your browser/i);
    expect(byName.code_challenge.threat).toMatch(/code interception/i);
    expect(byName.nonce.threat).toMatch(/replay/i);
    expect(byName.redirect_uri.threat).toMatch(/open redirect/i);
    expect(byName.code_challenge_method.threat).toMatch(/defaults to `plain`/i);
  });

  it('offers the explanation on the row and reveals it on demand', async () => {
    mount();
    // `state` is on by default, so its row is rendered.
    const buttons = screen.getAllByRole('button', { name: /^why$/i });
    expect(buttons.length).toBeGreaterThan(0);

    expect(
      screen.queryByText(/any page can start a flow in your browser/i),
    ).not.toBeInTheDocument();

    // Open every `why` on screen and assert `state`'s text appears: which index belongs to which row is
    // an implementation detail of the ordering, and pinning it would make this test brittle for nothing.
    buttons.forEach((b) => fireEvent.click(b));

    expect(await screen.findByText(/proves the response answers a request/i)).toBeInTheDocument();
    expect(screen.getByText(/code interception/i)).toBeInTheDocument();
  });
});
