import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JarSection } from '@/components/oidc/JarSection';
import * as jarService from '@/services/jar.service';
import {
  mountSection,
  fill,
  press,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * JAR — the section whose dead flow started this whole exercise.
 *
 * `requireBasicAuth("jar")` was added server-side on 2026-08-13, because the response leaks an Authlete
 * **ticket** — a credential. `jar.service.ts` went on calling `http.postJson` and `JarSection` had no
 * credential field, so **every user got a 401** while Module 05's lab had been authenticating its `curl`
 * since the day of the change. Four green gates, a green smoke test, and a section that could not work.
 *
 * The smoke test could not see it because the button was enabled and the request did go out — just
 * unauthenticated. That is the shape this file exists to catch.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

/** A realistic `/api/jar/process` response: the server's allowlisted five fields, nothing more. */
const JAR_OK = {
  action: 'INTERACTION',
  resultCode: 'A004001',
  resultMessage: '[A004001] The request is valid.',
  responseContent: null,
  scopes: [{ name: 'openid' }, { name: 'profile' }],
};

/**
 * Get the section to a state where the process button can fire.
 *
 * Signing needs `crypto.subtle`, which jsdom provides — so this drives the real key generation and the
 * real signature rather than mocking them. That is worth the second or two: `createRequestObject` is the
 * thing that makes a JAR a JAR, and a test that mocked it would pass with an unsigned object.
 */
async function signARequestObject(): Promise<void> {
  press(/Generate ES256 Key Pair/i);
  await waitFor(
    () =>
      expect((screen.getByLabelText(/Public JWK Set/i) as HTMLTextAreaElement).value).not.toBe(''),
    { timeout: 5000 },
  );

  fill(
    /JWT Claims \(JSON\)/i,
    JSON.stringify({
      iss: '1523514379',
      aud: 'http://localhost:3000',
      client_id: '1523514379',
      response_type: 'code',
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    }),
  );

  press(/Sign Request Object/i);
  await waitFor(
    () =>
      expect(
        (screen.getByLabelText(/Signed Request Object \(JWT\)/i) as HTMLTextAreaElement).value,
      ).not.toBe(''),
    { timeout: 5000 },
  );
}

describe('JarSection — the request it sends', () => {
  it('carries the admin credential, which is why every user used to get a 401', async () => {
    const spy = vi.spyOn(jarService, 'processJar').mockResolvedValue(JAR_OK);
    mountSection(<JarSection />);
    await signARequestObject();

    fill(/^Client ID$/i, '1523514379');
    fill(/^Admin Client ID$/i, 'mgmt-id');
    fill(/^Admin Client Secret$/i, 'mgmt-secret');

    press(/Process (JAR|Request)/i);

    const args = await expectCall(spy, 'the JAR process button');
    // `btoa('mgmt-id:mgmt-secret')`, which is what `useCredentials` hands the service.
    expectSends(
      args,
      btoa('mgmt-id:mgmt-secret'),
      'the endpoint requires admin Basic auth (added 2026-08-13, because the response leaks a ticket)',
    );
    expectSends(args, '1523514379', 'the client id the user typed must reach the request');
  });

  it('refuses to send at all without the credential, rather than earning a 401', async () => {
    const spy = vi.spyOn(jarService, 'processJar');
    mountSection(<JarSection />);
    await signARequestObject();
    fill(/^Client ID$/i, '1523514379');
    // No admin credentials entered.

    const button = screen.getByRole('button', { name: /Process (JAR|Request)/i });
    expect(
      button,
      'the control should be disabled without the credential the server requires',
    ).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  /**
   * The FAPI class, applied here: the section must read the fields the server actually returns.
   *
   * `/api/jar/process` returns an **allowlist** — `action`, `resultCode`, `resultMessage`,
   * `responseContent`, `scopes` — and `resultMessage` and `scopes` are the two Module 05's lab reads.
   * A rename on either side would leave this panel blank with no error.
   */
  it('renders the result message and the scopes from the response', async () => {
    vi.spyOn(jarService, 'processJar').mockResolvedValue(JAR_OK);
    mountSection(<JarSection />);
    await signARequestObject();
    fill(/^Client ID$/i, '1523514379');
    fill(/^Admin Client ID$/i, 'mgmt-id');
    fill(/^Admin Client Secret$/i, 'mgmt-secret');
    press(/Process (JAR|Request)/i);

    await expectReadsBack(/A004001/, 'the Authlete result code');
    await expectReadsBack(/openid/, 'the scopes the signed object asked for');
  });

  /**
   * `[A005328]` is what a bad signature earns, and it is exactly the code this section most needs to
   * explain — it was one of only two sections rendering a raw error string with no decoder.
   */
  it('explains a refusal instead of printing it raw, and prints it only once', async () => {
    vi.spyOn(jarService, 'processJar').mockRejectedValue(
      new Error('400 Bad Request · [A005328] The signature of the request object is invalid.'),
    );
    mountSection(<JarSection />);
    await signARequestObject();
    fill(/^Client ID$/i, '1523514379');
    fill(/^Admin Client ID$/i, 'mgmt-id');
    fill(/^Admin Client Secret$/i, 'mgmt-secret');
    press(/Process (JAR|Request)/i);

    // The decoder's own words, not the server's — proof the explainer ran.
    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();

    /**
     * **Twice, and exactly twice**, which is the design rather than a bug.
     *
     * `ErrorExplainer`'s rule is that *"the raw text is never replaced, only accompanied"* — so the code
     * appears once in the verbatim response and once as the decoded badge beside its explanation. A
     * reader has to be able to see exactly what arrived, both to trust the explanation and to notice
     * when it does not fit.
     *
     * Before this file existed it was **three**: the PED-08 fix added the explainer and left a bare
     * `<p>{String(error)}</p>` above it, so the raw string rendered twice over. Found by writing this
     * assertion, expecting 1, and reading why it was 3. The same leftover was in `FapiSection`.
     */
    const occurrences = screen.getAllByText(/A005328/);
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((el) => el.tagName)).toEqual(['P', 'CODE']);
  });
});
