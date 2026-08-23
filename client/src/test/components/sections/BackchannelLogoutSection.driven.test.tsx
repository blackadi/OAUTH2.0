import { screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BackchannelLogoutSection } from '@/components/oidc/BackchannelLogoutSection';
import { backchannelLogoutService } from '@/services';
import {
  mountSection,
  fill,
  fillAdminCredentials,
  press,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * Back-Channel Logout — three admin-gated endpoints, and the one section where **"it worked" is not
 * the same claim as "it interoperates"**.
 *
 * Since BCL-W5 the service carries `backchannelLogoutSupported: true` and client `1523514379` has a
 * `backchannel_logout_uri` pointing at **this deployment's own** `/api/backchannel_logout`. So
 * `deliverAll` is executable for the first time — it has somebody to deliver to. ⚠️ There is no
 * third-party RP; the loop is closed against ourselves, so a successful delivery must not be written up
 * as *"back-channel logout works"*.
 *
 * All three endpoints require admin Basic auth, and `requireBasicAuth` **fails closed** — if either
 * management variable is unset every one of them answers 401 rather than allowing the request. The
 * section's controls are disabled without the credential, which is the client-side half of that.
 *
 * The `deliver-all` gate is the interesting one: it takes `subject` **or** `sessionId` rather than a
 * client identifier, because it delivers to every RP the subject is logged into. A section that gated
 * it on `clientIdentifier` like its two siblings would make the operation unreachable.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

const CREDENTIAL = btoa('mgmt-id:mgmt-secret');
const ISSUED = { action: 'OK', responseContent: 'eyJhbGciOiJSUzI1NiJ9.logout-token.sig' };

describe('BackchannelLogoutSection — the credential all three require', () => {
  it('offers nothing until the management credential is entered', () => {
    mountSection(<BackchannelLogoutSection />);

    for (const name of [/Issue Token/i, /^Issue & Deliver$/i, /Issue & Deliver All/i]) {
      expect(
        screen.getByRole('button', { name }),
        `"${String(name)}" is enabled with no credential — requireBasicAuth fails closed, so this is a guaranteed 401`,
      ).toBeDisabled();
    }
  });

  it('sends the credential and the client identifier on issue', async () => {
    const spy = vi.spyOn(backchannelLogoutService, 'issue').mockResolvedValue(ISSUED);
    mountSection(<BackchannelLogoutSection />);
    fillAdminCredentials();

    fill(/Client Identifier/i, '1523514379');
    fill(/^Subject$/i, 'admin');
    press(/Issue Token/i);

    const args = await expectCall(spy, 'the Issue Token button');
    expectSends(args, CREDENTIAL, 'all three endpoints are behind requireBasicAuth');
    expectSends(args, '1523514379', 'the RP the logout token is minted for');
    expectSends(args, 'admin', 'the subject whose session is ending');
  });

  it('sends the credential on deliver too', async () => {
    const spy = vi.spyOn(backchannelLogoutService, 'deliver').mockResolvedValue(ISSUED);
    mountSection(<BackchannelLogoutSection />);
    fillAdminCredentials();

    fill(/Client Identifier/i, '1523514379');
    fill(/Session ID/i, 'sess-9');
    press(/^Issue & Deliver$/i);

    const [body, auth] = (await expectCall(spy, 'the Issue & Deliver button')) as [
      Record<string, string>,
      string,
    ];
    expect(auth).toBe(CREDENTIAL);
    expect(body.clientIdentifier).toBe('1523514379');
    expect(body.sessionId).toBe('sess-9');
  });
});

describe('BackchannelLogoutSection — deliver-all, which is gated differently on purpose', () => {
  /**
   * It delivers to **every** RP the subject is logged into, so it takes a subject or a session — never
   * a client identifier. Gating it on `clientIdentifier` like its two siblings would make the operation
   * unreachable, which is the sort of copy-paste that reads as consistency.
   */
  it('enables on a subject alone, with no client identifier', async () => {
    const spy = vi
      .spyOn(backchannelLogoutService, 'deliverAll')
      .mockResolvedValue([{ clientId: 1523514379, delivered: true }]);
    mountSection(<BackchannelLogoutSection />);
    fillAdminCredentials();

    fill(/^Subject$/i, 'admin');
    press(/Issue & Deliver All/i);

    const [body] = (await expectCall(spy, 'the Issue & Deliver All button')) as [
      Record<string, string>,
    ];
    expect(body.subject).toBe('admin');
    // Not sent at all: this operation is not about one RP.
    expect(body.clientIdentifier).toBeUndefined();
  });

  it('enables on a session id alone too', () => {
    mountSection(<BackchannelLogoutSection />);
    fillAdminCredentials();
    fill(/Session ID/i, 'sess-9');

    expect(screen.getByRole('button', { name: /Issue & Deliver All/i })).toBeEnabled();
    // The other two still need an RP to deliver to.
    expect(screen.getByRole('button', { name: /Issue Token/i })).toBeDisabled();
  });

  it('stays disabled with neither a subject nor a session', () => {
    mountSection(<BackchannelLogoutSection />);
    fillAdminCredentials();
    fill(/Client Identifier/i, '1523514379');

    // A client identifier alone says nothing about *whose* sessions to end.
    expect(screen.getByRole('button', { name: /Issue & Deliver All/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Issue Token/i })).toBeEnabled();
  });

  it('renders the per-RP delivery outcome, which is the only evidence anything happened', async () => {
    vi.spyOn(backchannelLogoutService, 'deliverAll').mockResolvedValue([
      { clientId: 1523514379, delivered: true, status: 200 },
      { clientId: 4277838306, delivered: false, error: 'no backchannel_logout_uri' },
    ]);
    mountSection(<BackchannelLogoutSection />);
    fillAdminCredentials();
    fill(/^Subject$/i, 'admin');
    press(/Issue & Deliver All/i);

    // A delivery that silently succeeded for nobody looks identical to one that worked, so the
    // per-client outcome is the whole point of the response.
    await expectReadsBack(/1523514379/, 'the RP that accepted the logout token');
    await expectReadsBack(/no backchannel_logout_uri/, 'the RP that had nowhere to deliver to');
  });

  it('explains a refusal instead of printing it raw', async () => {
    vi.spyOn(backchannelLogoutService, 'issue').mockRejectedValue(
      new Error(
        '{"error":"invalid_client","error_description":"Basic authentication is required."}',
      ),
    );
    mountSection(<BackchannelLogoutSection />);
    fillAdminCredentials();
    fill(/Client Identifier/i, '1523514379');
    press(/Issue Token/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
  });
});
