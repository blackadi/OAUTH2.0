import { screen, cleanup, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenVault } from '@/components/ui/TokenVault';
import { mountSection, seedTokens, resetSectionState } from '@/test/helpers/drive-section';

/**
 * The Token Vault — the one place this app displays a live access token, refresh token and ID token at
 * once, and the one place a copy button has to hand over the *real* value rather than the truncated
 * display string sitting beside it. It had no dedicated test: every driven suite that seeds a token only
 * ever reads it back out of the vault, never exercises expand/collapse, the inspector toggle, the
 * per-token-type inspectability rule, or the clear confirmation.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

/** Long enough to exercise the vault's 100-character truncation. */
const LONG_JWT =
  'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiJhZG1pbiIsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ' +
  '.signature-bytes-here-padding-to-make-this-string-longer-than-a-hundred-characters-total';

describe('TokenVault — nothing shown, nothing to hold', () => {
  it('starts collapsed by default, offering no token rows', () => {
    seedTokens({ access_token: 'at-1' });
    mountSection(<TokenVault />);
    expect(screen.getByRole('button', { name: /Token Vault/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText(/Access Token/i)).not.toBeInTheDocument();
  });

  it('respects defaultExpanded, and says so when there is nothing held', () => {
    sessionStorage.clear();
    mountSection(<TokenVault defaultExpanded />);
    expect(screen.getByText(/No tokens yet/i)).toBeInTheDocument();
    // No dot indicator, and no Clear control, for an empty vault.
    expect(screen.queryByRole('button', { name: /Clear tokens/i })).not.toBeInTheDocument();
  });
});

describe('TokenVault — which tokens it shows, and which it lets you inspect', () => {
  it('shows only the token types actually held', () => {
    seedTokens({ access_token: 'at-1', id_token: undefined, refresh_token: undefined });
    mountSection(<TokenVault defaultExpanded />);

    expect(screen.getByText('Access Token')).toBeInTheDocument();
    expect(screen.queryByText('Refresh Token')).not.toBeInTheDocument();
    expect(screen.queryByText('ID Token')).not.toBeInTheDocument();
  });

  it('offers Inspect for the access and ID tokens, never for the refresh token', () => {
    seedTokens({ access_token: 'at-1', refresh_token: 'rt-1', id_token: 'idt-1' });
    mountSection(<TokenVault defaultExpanded />);

    const rows = screen.getAllByText(/Token$/).map((badge) => badge.closest('div')!.parentElement!);
    const refreshRow = rows.find((r) => within(r).queryByText('Refresh Token'));
    expect(
      within(refreshRow!).queryByRole('button', { name: /Inspect/i }),
      'a refresh token is opaque by design (RFC 6749) — there is nothing in it to decode',
    ).not.toBeInTheDocument();

    // Both the access and ID token rows offer it.
    expect(screen.getAllByRole('button', { name: /Inspect/i })).toHaveLength(2);
  });

  it('toggles the inspector open and closed on the same button', () => {
    seedTokens({ access_token: LONG_JWT });
    mountSection(<TokenVault defaultExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /Inspect/i }));
    expect(screen.getByRole('button', { name: /^Hide$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Hide$/i }));
    expect(screen.getByRole('button', { name: /Inspect/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Hide$/i })).not.toBeInTheDocument();
  });

  /**
   * Two different inspectors must not both be open from one click — `inspecting` holds a single label,
   * so opening the ID token's inspector has to close the access token's.
   */
  it('only inspects one token at a time', () => {
    seedTokens({ access_token: 'at-1', id_token: 'idt-1' });
    mountSection(<TokenVault defaultExpanded />);

    const [accessInspect, idInspect] = screen.getAllByRole('button', { name: /Inspect/i });
    fireEvent.click(accessInspect);
    expect(screen.getByRole('button', { name: /^Hide$/i })).toBeInTheDocument();

    fireEvent.click(idInspect);
    // Still exactly one "Hide" — the access token's inspector closed when the ID token's opened.
    expect(screen.getAllByRole('button', { name: /^Hide$/i })).toHaveLength(1);
  });
});

describe('TokenVault — the copy button hands over the real value, not the truncated display', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('truncates the on-screen text past 100 characters', () => {
    seedTokens({ access_token: LONG_JWT });
    mountSection(<TokenVault defaultExpanded />);
    expect(LONG_JWT.length).toBeGreaterThan(100);
    expect(screen.getByText(`${LONG_JWT.slice(0, 100)}…`)).toBeInTheDocument();
    expect(screen.queryByText(LONG_JWT)).not.toBeInTheDocument();
  });

  it('copies the full, untruncated token — not the ellipsised string on screen', () => {
    seedTokens({ access_token: LONG_JWT });
    mountSection(<TokenVault defaultExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LONG_JWT);
  });
});

describe('TokenVault — clearing the vault', () => {
  it('offers no Clear control when there is nothing to clear', () => {
    sessionStorage.clear();
    mountSection(<TokenVault defaultExpanded />);
    expect(screen.queryByRole('button', { name: /Clear tokens/i })).not.toBeInTheDocument();
  });

  it('asks before clearing, and says it removes more than the three visible tokens', async () => {
    seedTokens({ access_token: 'at-1' });
    mountSection(<TokenVault defaultExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /Clear tokens/i }));

    const dialog = await screen.findByRole('dialog');
    // The vault clears DPoP keys and signing keys too, which is worth stating before someone confirms —
    // this is the property a driven test elsewhere would not catch, since it never opens this dialog.
    expect(within(dialog).getByText(/DPoP key pair/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/private_key_jwt signing key/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Nothing is revoked at the authorization server/i),
    ).toBeInTheDocument();
  });

  it('actually clears the session once confirmed, closing the dialog and emptying the vault', async () => {
    seedTokens({ access_token: 'at-1' });
    mountSection(<TokenVault defaultExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /Clear tokens/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Clear session/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText(/No tokens yet/i)).toBeInTheDocument();
  });

  it('cancels without touching the session', async () => {
    seedTokens({ access_token: 'at-1' });
    mountSection(<TokenVault defaultExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /Clear tokens/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Access Token')).toBeInTheDocument();
  });
});
