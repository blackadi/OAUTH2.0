import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CibaSection } from '@/components/oidc/CibaSection';
import { cibaService } from '@/services';
import {
  mountSection,
  fill,
  press,
  selectOp,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * CIBA — a **sequence**, not a menu, and a two-call split that is this server's shape rather than the
 * protocol's.
 *
 * CIBA Core §7.3 requires the backchannel endpoint itself to return `auth_req_id`. These four endpoints
 * are Authlete-shaped debugging surfaces: `/api/ciba/authentication` returns Authlete's **`ticket`**,
 * and the `auth_req_id` arrives only after a second call to `/api/ciba/issue` (CIBA-W5). So the
 * hand-off between the two tabs is load-bearing in a way it would not be on a conformant server, and it
 * is the FAPI class: `ticket` and `authReqId` are the fields, and reading either one wrongly leaves the
 * next tab empty with no error.
 *
 * The client-authentication half is CIBA-W3, fixed 2026-08-13: `ciba.service.ts` read `clientId` and
 * `clientSecret` from the JSON body and **never looked at `Authorization: Basic`** — so the very
 * configuration Authlete's own CIBA guide recommends (`CLIENT_SECRET_BASIC`) could not authenticate.
 * The section grew a Client Auth Method selector to match `ParSection`, which makes it another control
 * that can be decorative.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

/** `USER_IDENTIFICATION` → 200, carrying Authlete's ticket rather than §7.3's `auth_req_id`. */
const IDENTIFIED = {
  action: 'USER_IDENTIFICATION',
  ticket: 'ciba-ticket-01',
  hintType: 'LOGIN_HINT',
  hint: 'admin',
  deliveryMode: 'POLL',
};

/** `/api/ciba/issue` → the `auth_req_id` §7.3 wanted in the first place. */
const ISSUED = { action: 'OK', authReqId: 'auth-req-01', expiresIn: 600, interval: 9 };

describe('CibaSection — client authentication on the backchannel request', () => {
  it('sends the credentials via the Basic channel by default, and not in the body', async () => {
    const spy = vi.spyOn(cibaService, 'backchannelAuthentication').mockResolvedValue(IDENTIFIED);
    mountSection(<CibaSection />);
    await selectOp(/^Authentication$/i);

    fill(/^Client ID$/i, '1523514379');
    fill(/^Client Secret$/i, 'the-secret');
    press(/^Run$/i);

    const [body, basicAuth] = (await expectCall(spy, 'the Authentication Run button')) as [
      Record<string, string>,
      { clientId: string; clientSecret: string } | undefined,
    ];
    expect(basicAuth?.clientId).toBe('1523514379');
    expect(basicAuth?.clientSecret).toBe('the-secret');
    // Basic is Authlete's recommended configuration here, and the body credentials for such a client
    // now correctly earn `401 [A157357]` — so duplicating them would be a defect, not redundancy.
    expect(body.clientSecret).toBeUndefined();
  });

  it('moves them into the body when the post channel is chosen', async () => {
    const spy = vi.spyOn(cibaService, 'backchannelAuthentication').mockResolvedValue(IDENTIFIED);
    mountSection(<CibaSection />);
    await selectOp(/^Authentication$/i);

    fill(/^Client ID$/i, '1523514379');
    fill(/^Client Secret$/i, 'the-secret');
    fill(/Client Auth Method/i, 'post');
    press(/^Run$/i);

    const [body, basicAuth] = (await expectCall(spy, 'the Authentication Run button')) as [
      Record<string, string>,
      unknown,
    ];
    expect(body.clientId).toBe('1523514379');
    expect(body.clientSecret).toBe('the-secret');
    expect(basicAuth, 'the channel is a choice, so the other one must be empty').toBeUndefined();
  });

  it('carries the login_hint and scope the user typed', async () => {
    const spy = vi.spyOn(cibaService, 'backchannelAuthentication').mockResolvedValue(IDENTIFIED);
    mountSection(<CibaSection />);
    await selectOp(/^Authentication$/i);

    fill(/Parameters \(URL-encoded\)/i, 'login_hint=alice&scope=openid%20profile');
    fill(/^Client ID$/i, '1523514379');
    press(/^Run$/i);

    const args = await expectCall(spy, 'the Authentication Run button');
    expectSends(
      args,
      'login_hint=alice',
      '§7.1 identifies the user by hint; without it there is nobody to notify',
    );
  });
});

describe('CibaSection — the two-call split this server imposes', () => {
  /**
   * The hand-off. `ticket` is Authlete's, not the protocol's, and every subsequent tab needs it — so a
   * rename on that field leaves three tabs silently empty.
   */
  it('carries the ticket from Authentication into Issue, Fail and Complete', async () => {
    vi.spyOn(cibaService, 'backchannelAuthentication').mockResolvedValue(IDENTIFIED);
    mountSection(<CibaSection />);
    await selectOp(/^Authentication$/i);
    fill(/^Client ID$/i, '1523514379');
    press(/^Run$/i);

    await expectReadsBack(/ciba-ticket-01/, 'the ticket in the response');

    for (const tab of [/^Issue$/i, /^Fail$/i, /^Complete$/i]) {
      await selectOp(tab);
      await waitFor(() =>
        expect((screen.getByLabelText(/^Ticket$/i) as HTMLInputElement).value).toBe(
          'ciba-ticket-01',
        ),
      );
    }
  });

  /**
   * And the second half: `authReqId` is what §7.3 says the *first* call should have returned, and
   * `interval` is what §11 says the client must respect. Both come back from `issue`, and both feed the
   * poll tab.
   */
  it('carries the auth_req_id and the interval from Issue into the poll', async () => {
    vi.spyOn(cibaService, 'issue').mockResolvedValue(ISSUED);
    mountSection(<CibaSection />);
    await selectOp(/^Issue$/i);
    fill(/^Ticket$/i, 'ciba-ticket-01');
    press(/^Run$/i);

    await expectReadsBack(/auth-req-01/, 'the auth_req_id in the response');

    await selectOp(/Poll Token/i);
    await waitFor(() =>
      expect((screen.getByLabelText(/^auth_req_id$/i) as HTMLInputElement).value).toBe(
        'auth-req-01',
      ),
    );
    // §11: the client MUST respect the interval the server sent, not the 5s default.
    expect(screen.getByText(/Expected interval: 9s/)).toBeInTheDocument();
  });

  it('sends the chosen fail reason, not a fixed one', async () => {
    const spy = vi.spyOn(cibaService, 'fail').mockResolvedValue({ action: 'FORBIDDEN' });
    mountSection(<CibaSection />);
    await selectOp(/^Fail$/i);

    fill(/^Ticket$/i, 'ciba-ticket-01');
    fill(/^Reason$/i, 'UNKNOWN_USER_ID');
    press(/^Run$/i);

    const args = (await expectCall(spy, 'the Fail Run button')) as string[];
    expect(args).toEqual(['ciba-ticket-01', 'UNKNOWN_USER_ID']);
  });

  it('sends the chosen completion result, so a denial is not an approval', async () => {
    const spy = vi.spyOn(cibaService, 'complete').mockResolvedValue({ action: 'NO_ACTION' });
    mountSection(<CibaSection />);
    await selectOp(/^Complete$/i);

    fill(/^Ticket$/i, 'ciba-ticket-01');
    fill(/^Result$/i, 'ACCESS_DENIED');
    fill(/^Subject$/i, 'alice');
    press(/^Run$/i);

    const args = (await expectCall(spy, 'the Complete Run button')) as string[];
    expect(args).toEqual(['ciba-ticket-01', 'ACCESS_DENIED', 'alice']);
  });
});

describe('CibaSection — the poll, where a non-2xx is data', () => {
  /**
   * `pollToken` goes through `sendRaw`, deliberately: `authorization_pending` and `slow_down` are the
   * **normal** states of a CIBA poll loop (§11), so a throw would turn the expected case into an
   * exception. The section switches on the status, which is only possible because the status survives.
   */
  it('reports authorization_pending as a state, not a failure', async () => {
    vi.spyOn(cibaService, 'issue').mockResolvedValue(ISSUED);
    vi.spyOn(cibaService, 'pollToken').mockResolvedValue({
      status: 400,
      body: { error: 'authorization_pending' },
    });
    mountSection(<CibaSection />);
    await selectOp(/^Issue$/i);
    fill(/^Ticket$/i, 'ciba-ticket-01');
    press(/^Run$/i);
    await selectOp(/Poll Token/i);
    await waitFor(() =>
      expect((screen.getByLabelText(/^auth_req_id$/i) as HTMLInputElement).value).toBe(
        'auth-req-01',
      ),
    );
    press(/^Poll Token$/i);

    await expectReadsBack(
      /Pending — retry in 9s/,
      'the pending state, quoting the server’s interval',
    );
  });

  /** §11: `slow_down` means back off, and the new interval must actually be adopted. */
  it('adopts the interval a slow_down carries', async () => {
    vi.spyOn(cibaService, 'issue').mockResolvedValue(ISSUED);
    vi.spyOn(cibaService, 'pollToken').mockResolvedValue({
      status: 400,
      body: { error: 'slow_down', interval: 20 },
    });
    mountSection(<CibaSection />);
    await selectOp(/^Issue$/i);
    fill(/^Ticket$/i, 'ciba-ticket-01');
    press(/^Run$/i);
    await selectOp(/Poll Token/i);
    await waitFor(() =>
      expect((screen.getByLabelText(/^auth_req_id$/i) as HTMLInputElement).value).toBe(
        'auth-req-01',
      ),
    );
    press(/^Poll Token$/i);

    await expectReadsBack(/Slow down — retry in 20s/, 'the backed-off interval');
    expect(screen.getByText(/Expected interval: 20s/)).toBeInTheDocument();
  });

  it('renders the tokens on a 200', async () => {
    vi.spyOn(cibaService, 'issue').mockResolvedValue(ISSUED);
    vi.spyOn(cibaService, 'pollToken').mockResolvedValue({
      status: 200,
      body: { access_token: 'at-ciba-01', token_type: 'Bearer' },
    });
    mountSection(<CibaSection />);
    await selectOp(/^Issue$/i);
    fill(/^Ticket$/i, 'ciba-ticket-01');
    press(/^Run$/i);
    await selectOp(/Poll Token/i);
    await waitFor(() =>
      expect((screen.getByLabelText(/^auth_req_id$/i) as HTMLInputElement).value).toBe(
        'auth-req-01',
      ),
    );
    press(/^Poll Token$/i);

    await expectReadsBack(/at-ciba-01/, 'the access token from a completed CIBA flow');
  });

  it('refuses to poll with no auth_req_id rather than sending an empty one', async () => {
    const spy = vi.spyOn(cibaService, 'pollToken');
    mountSection(<CibaSection />);
    await selectOp(/Poll Token/i);
    press(/^Poll Token$/i);

    await waitFor(() => expect(spy).not.toHaveBeenCalled());
  });
});
