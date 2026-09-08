import { screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NativeSsoSection } from '@/components/oidc/NativeSsoSection';
import { nativeSsoService } from '@/services';
import {
  mountSection,
  seedTokens,
  fill,
  fillAdminCredentials,
  press,
  selectOp,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * Native SSO's two operations both process a request Authlete's own `/nativesso` API defines, gated by
 * this deployment's admin credential rather than a per-client one — the same posture `DcrSection` and
 * `FederationSection`'s Registration tab have.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

const CREDENTIAL = btoa('mgmt-id:mgmt-secret');

describe('NativeSsoSection — Process', () => {
  it('pre-fills the device secret from the vault and sends it with the admin credential', async () => {
    seedTokens({ device_secret: 'ds-from-vault' });
    const spy = vi.spyOn(nativeSsoService, 'process').mockResolvedValue({
      action: 'OK',
      responseContent: JSON.stringify({ access_token: 'new-at' }),
    });
    mountSection(<NativeSsoSection />);
    await selectOp(/^Process$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    press(/^Process$/i);

    const args = await expectCall(spy, 'the Process button');
    const [body, auth] = args as [Record<string, string>, string];
    expect(body.accessToken).toBe('at-seeded');
    expect(body.deviceSecret).toBe('ds-from-vault');
    expect(auth).toBe(CREDENTIAL);
  });

  it('refuses to fire without an access token in the vault', async () => {
    const spy = vi.spyOn(nativeSsoService, 'process');
    mountSection(<NativeSsoSection />);
    await selectOp(/^Process$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    expect(screen.getByText(/No access token available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Process$/i })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends an edited device secret rather than silently keeping the vault value', async () => {
    seedTokens({ device_secret: 'ds-from-vault' });
    const spy = vi.spyOn(nativeSsoService, 'process').mockResolvedValue({
      action: 'OK',
      responseContent: '{}',
    });
    mountSection(<NativeSsoSection />);
    await selectOp(/^Process$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');
    fill(/^deviceSecret \(REQUIRED\)$/i, 'a-deliberately-wrong-secret');

    press(/^Process$/i);

    const [body] = (await expectCall(spy, 'the Process button')) as [Record<string, string>];
    expect(body.deviceSecret).toBe('a-deliberately-wrong-secret');
  });

  it('decodes the responseContent JSON string alongside the raw envelope', async () => {
    seedTokens({ device_secret: 'ds-from-vault' });
    vi.spyOn(nativeSsoService, 'process').mockResolvedValue({
      action: 'OK',
      responseContent: JSON.stringify({ access_token: 'new-at', device_secret: 'ds-2' }),
    });
    mountSection(<NativeSsoSection />);
    await selectOp(/^Process$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');
    press(/^Process$/i);

    await expectReadsBack(/"access_token": "new-at"/, 'the decoded responseContent');
  });

  it('explains a refusal instead of printing it raw', async () => {
    seedTokens({ device_secret: 'ds-from-vault' });
    vi.spyOn(nativeSsoService, 'process').mockRejectedValue(
      new Error('{"error":"invalid_request","error_description":"device secret mismatch"}'),
    );
    mountSection(<NativeSsoSection />);
    await selectOp(/^Process$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');
    press(/^Process$/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
  });
});

describe('NativeSsoSection — Logout', () => {
  it('sends the session ID with the admin credential', async () => {
    const spy = vi.spyOn(nativeSsoService, 'logout').mockResolvedValue({ action: 'OK', count: 2 });
    mountSection(<NativeSsoSection />);
    await selectOp(/^Logout$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');
    fill(/sessionId/i, 'session-xyz');

    press(/^Logout$/i);

    const args = await expectCall(spy, 'the Logout button');
    expectSends(args, 'session-xyz', 'sessionId is the only thing this call needs');
    expectSends(args, CREDENTIAL, 'logout ends a shared session, so it is admin-gated');
  });

  it('refuses to fire with no session ID', async () => {
    const spy = vi.spyOn(nativeSsoService, 'logout');
    mountSection(<NativeSsoSection />);
    await selectOp(/^Logout$/i);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin');

    expect(screen.getByRole('button', { name: /^Logout$/i })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });
});
