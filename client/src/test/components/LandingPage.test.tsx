import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import LandingPage from '@/pages/LandingPage';
import { Input } from '@/components/ui/Input';
import { PREFERENCE_KEYS, shouldSkipLanding, setSkipLanding } from '@/services/preferences';
import { CLIENT_ID, CLIENT_SECRET, PLACEHOLDER_CLIENT_SECRET } from '@/config';

/**
 * The on-ramp (Q1(b)).
 *
 * `/` was a redirect to a twenty-item dashboard whose first control is a form. The audit scored the
 * on-ramp **1/5** and called it the widest competitive gap — *"the best of the five at explaining a
 * parameter and the worst of the five at getting someone started"*.
 *
 * The thing worth testing here is not the prose. It is the claim that makes this more than a welcome mat:
 * **the configuration block reads the live build and says which values are wrong.** A getting-started
 * page reciting what `.env` should contain is documentation; one showing what it does contain is a
 * debugger, and it is the only version that can be wrong in a way a test can catch.
 */

beforeEach(() => {
  localStorage.clear();
  // The page polls `/api/health`; nothing here asserts on connectivity.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline in test'));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe('what the page tells someone who has just arrived', () => {
  it('says what this is, in an h1 — the only one on the route', () => {
    mount();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/OAuth 2.x and OpenID Connect/i);
  });

  it('offers exactly one path in, and points it at the flow it just described', () => {
    mount();
    expect(
      screen.getByRole('link', { name: /Start the authorization-code flow/i }),
    ).toHaveAttribute('href', '/auth-flows?op=authorization_code');
  });

  /**
   * An anchor, not a button. Middle-click, copy-link and open-in-new-tab all depend on it, and a
   * `<button>` that navigates has none of them — which is why `buttonVariants` is exported separately
   * from `Button`.
   */
  it('makes the primary action a real link', () => {
    mount();
    const link = screen.getByRole('link', { name: /Start the authorization-code flow/i });
    expect(link.tagName).toBe('A');
  });

  it('links onward to the reading surface rather than making this page the corpus', () => {
    mount();
    expect(screen.getByRole('link', { name: /read the reference/i })).toHaveAttribute(
      'href',
      '/reference',
    );
  });
});

describe('the configuration block reads this build, not the README', () => {
  it('shows the client_id that is actually configured', () => {
    mount();
    expect(screen.getByText(CLIENT_ID)).toBeInTheDocument();
  });

  /**
   * The asymmetry that looks wrong and is not: a placeholder `client_id` is a **problem**, an empty
   * `client_secret` is **correct**. The SPA's own client is public with `tokenAuthMethod: NONE`, and
   * Authlete refuses any client-authentication data for such a client with `[A157303]`.
   */
  it('reports an empty client_secret as correct rather than as unfinished', () => {
    mount();
    expect(CLIENT_SECRET, 'this build should have no secret configured').toBe('');
    expect(screen.getByText(/none — public client/i)).toBeInTheDocument();
    expect(screen.getByText(/its own client is public/i)).toBeInTheDocument();

    // The tone, not just the prose. Marking this row as a problem would send someone to invent a secret
    // for a client whose authentication method is `none` — which Authlete refuses with `[A157303]`.
    const row = screen.getByText('client_secret');
    expect(row.querySelector('[aria-label="needs attention"]')).toBeNull();
    expect(row.querySelector('[aria-label="configured correctly"]')).not.toBeNull();
  });

  /**
   * The icons are the state, so they must be in the accessibility tree. A tick and a triangle differing
   * only in shape and hue say nothing to a screen reader — the same finding `FlowDiagram` records about
   * its step circles.
   */
  it('names each status icon rather than leaving colour to carry it', () => {
    mount();
    const named = screen.getAllByRole('img');
    expect(named.length).toBeGreaterThan(0);
    for (const icon of named) {
      expect(icon.getAttribute('aria-label')).toMatch(/configured correctly|needs attention/);
    }
  });

  it('names the placeholder secret so nobody sets it thinking it is a value', () => {
    mount();
    expect(screen.getByText(new RegExp(PLACEHOLDER_CLIENT_SECRET))).toBeInTheDocument();
  });

  /**
   * Where the value comes from, which is the whole content of Q1(a). "Registered in Authlete" is not an
   * answer if you do not know where Authlete's client list is.
   */
  it('says where a real client_id comes from', () => {
    mount();
    expect(screen.getByText(/VITE_CLIENT_ID/)).toBeInTheDocument();
  });

  it('tells you what to do when the server is not answering', async () => {
    mount();
    // `fetch` is mocked to reject, so the poll fails and the status flips to offline.
    await waitFor(() =>
      expect(screen.getByText(/npm --prefix server run dev/)).toBeInTheDocument(),
    );
  });
});

describe('the returning-user preference', () => {
  it('is off until the box is ticked — arriving twice is not a request to skip', () => {
    expect(shouldSkipLanding()).toBe(false);
    mount();
    expect(screen.getByRole('checkbox', { name: /Go straight to Grant Flows/i })).not.toBeChecked();
  });

  it('stores the opt-out when the box is ticked', () => {
    mount();
    fireEvent.click(screen.getByRole('checkbox', { name: /Go straight to Grant Flows/i }));

    expect(shouldSkipLanding()).toBe(true);
    expect(localStorage.getItem(PREFERENCE_KEYS.skipLanding)).toBe('true');
  });

  /**
   * **Removed, not set to `'false'`.** Two spellings of the same state is how a stale value outlives a
   * change to what the default means — the same write-with-no-else-branch lesson as `session-keys.ts`,
   * in the other direction.
   */
  it('removes the key when the box is unticked rather than writing a second falsy spelling', () => {
    setSkipLanding(true);
    mount();

    const box = screen.getByRole('checkbox', { name: /Go straight to Grant Flows/i });
    expect(box).toBeChecked();
    fireEvent.click(box);

    expect(localStorage.getItem(PREFERENCE_KEYS.skipLanding)).toBeNull();
    expect(shouldSkipLanding()).toBe(false);
  });

  it('says the page is still reachable, so the box does not read as a one-way door', () => {
    mount();
    expect(screen.getByText('/start')).toBeInTheDocument();
  });

  /**
   * `localStorage` throws rather than returning null in a Safari private window and under some
   * enterprise policies. A preference is never worth a blank screen.
   */
  it('survives storage being unavailable', () => {
    const boom = () => {
      throw new Error('SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);

    expect(() => mount()).not.toThrow();
    expect(shouldSkipLanding()).toBe(false);
    expect(() =>
      fireEvent.click(screen.getByRole('checkbox', { name: /Go straight to Grant Flows/i })),
    ).not.toThrow();
  });
});

describe('a field hint reaches the people who need it', () => {
  /**
   * Distinct from `placeholder`, which vanishes the moment anyone types and is therefore no use to the
   * person who has already typed the wrong thing — the exact case Q1(a) is about.
   */
  it('is announced, not merely displayed', () => {
    render(<Input label="Client ID" hint="Registered on your Authlete service." />);

    const field = screen.getByLabelText('Client ID');
    const hint = screen.getByText(/Registered on your Authlete service/i);
    expect(hint.id).toBeTruthy();
    expect(field.getAttribute('aria-describedby')).toContain(hint.id);
  });

  it('describes the field alongside an error rather than replacing it, error first', () => {
    render(<Input label="Client ID" error="No such client" hint="Where to find one." />);

    const field = screen.getByLabelText('Client ID');
    const described = (field.getAttribute('aria-describedby') ?? '').split(' ');
    const errorId = screen.getByText('No such client').id;
    const hintId = screen.getByText('Where to find one.').id;

    expect(described).toContain(errorId);
    expect(described).toContain(hintId);
    // The error is the more urgent of the two, and a screen reader announces these in the order given.
    expect(described.indexOf(errorId)).toBeLessThan(described.indexOf(hintId));
  });

  /**
   * `aria-describedby=""` points at nothing, which is worse than no attribute: some screen readers
   * announce an empty description and swallow the pause.
   */
  it('sets no describedby at all when there is nothing to describe', () => {
    render(<Input label="Client ID" />);
    expect(screen.getByLabelText('Client ID')).not.toHaveAttribute('aria-describedby');
  });
});
