import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeviceSection } from '@/components/oidc/DeviceSection';
import { deviceService } from '@/services';
import {
  mountSection,
  fill,
  press,
  selectOp,
  expectCall,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * Device Flow — four tabs, and the interesting one is the poll, because it is the only control in the
 * app that keeps calling after you stop looking at it.
 *
 * Two server-side facts shape what is worth asserting. `POST /api/device/complete` approves any live
 * user code as any subject with **no authentication of that subject**, so it is development-only and
 * answers a flat 404 elsewhere — a token-minting oracle for anyone who could read a code off a screen
 * (RFC 8628 §5.5). And `/api/device/verification` carries a 5/min limiter because unlimited attempts
 * are a code-enumeration oracle; §5.1 asks for rate limiting and its worked example assumes ~5 tries.
 *
 * The response half is T1-11's: `POST /api/device/authorization` answers **RFC 8628 §3.2's** body —
 * `device_code`, `user_code`, `verification_uri`, snake_case — not Authlete's camelCase envelope.
 */

beforeEach(resetSectionState);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** RFC 8628 §3.2's response, which is what the server forwards verbatim. */
const AUTHORIZED = {
  device_code: 'dev-code-01',
  user_code: 'WDJB-MJHT',
  verification_uri: 'http://localhost:3000/device',
  verification_uri_complete: 'http://localhost:3000/device?user_code=WDJB-MJHT',
  expires_in: 1800,
  interval: 5,
};

describe('DeviceSection — the device authorization request', () => {
  it('sends the parameters and client id the user set', async () => {
    const spy = vi.spyOn(deviceService, 'authorization').mockResolvedValue(AUTHORIZED);
    mountSection(<DeviceSection />);
    await selectOp(/^Authorization$/i);

    fill(/Parameters \(URL-encoded\)/i, 'scope=openid');
    fill(/^Client ID$/i, '1678274156');
    press(/^Run$/i);

    const [body] = (await expectCall(spy, 'the Authorization Run button')) as [
      Record<string, string>,
    ];
    expect(body.parameters).toBe('scope=openid');
    expect(body.clientId).toBe('1678274156');
  });

  /**
   * §3.1's device authorization endpoint is public and Authlete authenticates the client from the body
   * credentials, so a public client sends none — the same `[A157303]` rule as everywhere else.
   */
  it('leaves the secret empty for a public client rather than sending a placeholder', async () => {
    const spy = vi.spyOn(deviceService, 'authorization').mockResolvedValue(AUTHORIZED);
    mountSection(<DeviceSection />);
    await selectOp(/^Authorization$/i);

    fill(/^Client ID$/i, '1678274156');
    press(/^Run$/i);

    const [body] = (await expectCall(spy, 'the Authorization Run button')) as [
      Record<string, string>,
    ];
    expect(body.clientSecret).toBe('');
    expect(body.clientSecret).not.toBe('your_client_secret');
  });

  /** T1-11: the section reads §3.2's snake_case members, not Authlete's `userCode`/`deviceCode`. */
  it('renders the user code and device code from the specification-shaped body', async () => {
    vi.spyOn(deviceService, 'authorization').mockResolvedValue(AUTHORIZED);
    mountSection(<DeviceSection />);
    await selectOp(/^Authorization$/i);
    press(/^Run$/i);

    await expectReadsBack(/WDJB-MJHT/, 'the user_code the end user types');
    await expectReadsBack(/dev-code-01/, 'the device_code the device polls with');
    await expectReadsBack(/localhost:3000\/device/, 'the verification_uri');
  });
});

describe('DeviceSection — verification and completion', () => {
  it('sends the user code on verification', async () => {
    const spy = vi
      .spyOn(deviceService, 'verification')
      .mockResolvedValue({ action: 'VALID', clientName: 'Demo' });
    mountSection(<DeviceSection />);
    await selectOp(/^Verification$/i);

    fill(/^User Code$/i, 'WDJB-MJHT');
    press(/^Run$/i);

    const args = (await expectCall(spy, 'the Verification Run button')) as string[];
    expect(args).toEqual(['WDJB-MJHT']);
  });

  /**
   * `ACCESS_DENIED` is a request **result** value, not a response action:
   * `DeviceCompleteRequestResult` is `{AUTHORIZED, ACCESS_DENIED, TRANSACTION_FAILED}` while
   * `DeviceCompleteResponseAction` has no `ACCESS_DENIED` member. A denial returns `SUCCESS` → 200 and
   * the device learns of it as `access_denied` on its next poll. So the selector's value has to travel
   * as the caller's decision — a hardcoded `AUTHORIZED` would approve everything.
   */
  it('sends the chosen result, so a denial is not silently an approval', async () => {
    const spy = vi.spyOn(deviceService, 'complete').mockResolvedValue({ action: 'SUCCESS' });
    mountSection(<DeviceSection />);
    await selectOp(/^Complete$/i);

    fill(/^User Code$/i, 'WDJB-MJHT');
    fill(/^Result$/i, 'ACCESS_DENIED');
    fill(/^Subject$/i, 'user-1');
    press(/^Run$/i);

    const args = (await expectCall(spy, 'the Complete Run button')) as string[];
    expect(args).toEqual(['WDJB-MJHT', 'ACCESS_DENIED', 'user-1']);
  });
});

describe('DeviceSection — the poll, which keeps going after you stop watching', () => {
  it('polls with the device code and stops as soon as a token arrives', async () => {
    const spy = vi
      .spyOn(deviceService, 'pollToken')
      .mockResolvedValue({ access_token: 'at-device-01', token_type: 'Bearer' });
    mountSection(<DeviceSection />);
    await selectOp(/Poll Token/i);

    fill(/^Device Code$/i, 'dev-code-01');
    fill(/^Client ID$/i, '1678274156');
    press(/Start Polling/i);

    const args = (await expectCall(spy, 'the Start Polling button')) as unknown[];
    expect(args[0]).toBe('dev-code-01');
    expect(args[1]).toBe('1678274156');
    // A public client sends no secret, so the auth method is `undefined` rather than a default.
    expect(args[2]).toBeUndefined();
    expect(args[3]).toBeUndefined();

    await expectReadsBack(/at-device-01/, 'the token that ended the poll');
    // One call, not a loop that kept running past success — the interval must be cleared.
    await waitFor(() => expect(screen.queryByText(/^Polling\.\.\./)).not.toBeInTheDocument());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('presents the client secret on the chosen channel when there is one', async () => {
    const spy = vi.spyOn(deviceService, 'pollToken').mockResolvedValue({ access_token: 'at-2' });
    mountSection(<DeviceSection />);
    await selectOp(/Poll Token/i);

    fill(/^Device Code$/i, 'dev-code-01');
    fill(/^Client ID$/i, '1523514379');
    fill(/Client Secret/i, 'the-secret');
    fill(/Client Auth Method/i, 'post');
    press(/Start Polling/i);

    const args = (await expectCall(spy, 'the Start Polling button')) as unknown[];
    expect(args[2]).toBe('the-secret');
    // Authlete matches the channel against the client's registered method, so this is not cosmetic.
    expect(args[3]).toBe('post');
  });

  /**
   * **`authorization_pending` is not an error, and stopping on it would break the flow.** RFC 8628 §3.5
   * lists it beside `slow_down` as the two the client is expected to keep polling through; the terminal
   * set is `expired_token` and `access_denied`. A poll that halted on the normal case would never
   * complete a single device flow.
   */
  it('keeps polling through authorization_pending, which is the normal case', async () => {
    const spy = vi
      .spyOn(deviceService, 'pollToken')
      .mockRejectedValue(new Error('{"error":"authorization_pending"}'));
    mountSection(<DeviceSection />);
    await selectOp(/Poll Token/i);

    fill(/^Device Code$/i, 'dev-code-01');
    fill(/^Client ID$/i, '1678274156');
    press(/Start Polling/i);

    await expectCall(spy, 'the Start Polling button');
    // Still polling: the section shows the live indicator and offers a way out.
    expect(await screen.findByText(/^Polling\.\.\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stop Polling/i })).toBeEnabled();
  });

  it('stops on a terminal refusal rather than hammering the endpoint', async () => {
    vi.spyOn(deviceService, 'pollToken').mockRejectedValue(
      new Error('{"error":"expired_token","error_description":"The device code has expired."}'),
    );
    mountSection(<DeviceSection />);
    await selectOp(/Poll Token/i);

    fill(/^Device Code$/i, 'dev-code-01');
    fill(/^Client ID$/i, '1678274156');
    press(/Start Polling/i);

    // §3.5 makes `expired_token` terminal — there is nothing left to wait for.
    await waitFor(() => expect(screen.queryByText(/^Polling\.\.\./)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Restart|Start Polling/i })).toBeEnabled();
  });

  it('refuses to start without a device code, rather than polling for nothing', () => {
    const spy = vi.spyOn(deviceService, 'pollToken');
    mountSection(<DeviceSection />);
    void selectOp(/Poll Token/i);
    expect(spy).not.toHaveBeenCalled();
  });
});
