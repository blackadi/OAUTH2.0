import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HealthSection } from '@/components/admin/HealthSection';
import { healthService } from '@/services';
import { HttpError } from '@/services/transport';
import {
  mountSection,
  press,
  expectCall,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * Health Check — the section with no credential, where the dead-flow class is a *decorative control*.
 *
 * There is nothing to authenticate here, so the JAR class does not apply. What does apply is the FAPI
 * class in its purest form: this section reads six different fields off three different responses and
 * renders a badge from each. A rename on any one of them leaves a badge saying "Unknown" with no error
 * anywhere — the server is fine, the request is fine, and the screen is wrong.
 *
 * And one control worth pinning on its own: the **Extended check** checkbox is the only input in the
 * section, and its entire job is to become a query parameter. A checkbox that does not reach the
 * service is the MCP class — a value the user set that never travels.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

const SERVER_OK = { status: 'ok', uptime: 3725, timestamp: '2026-08-23T07:00:00.000Z' };

const OVERALL_REDIS_UP = {
  status: 'ok',
  uptime: 3725,
  timestamp: '2026-08-23T07:00:00.000Z',
  checks: { redis: { healthy: true, connected: true, configured: true } },
};

/**
 * A non-2xx from Authlete is a health *result*, not a transport failure, so `AuthleteError.statusCode`
 * is reported and the admin UI renders it as "HTTP n". Only a genuine network failure yields `error`
 * with no status — which is why both shapes are exercised below.
 */
const AUTHLETE_UNHEALTHY = { healthy: false, statusCode: 429, body: 'Too Many Requests' };

/**
 * Mock all three before mounting: two of them fire from an effect on the very first render.
 *
 * The spies are returned individually rather than through `ReturnType<typeof vi.spyOn>`, which resolves
 * to `any` on an overloaded generic and takes the type-aware lint rules down with it.
 */
function stubHealth() {
  const server = vi.spyOn(healthService, 'serverHealth').mockResolvedValue(SERVER_OK);
  const overall = vi.spyOn(healthService, 'overallHealth').mockResolvedValue(OVERALL_REDIS_UP);
  const authlete = vi.spyOn(healthService, 'authleteHealth').mockResolvedValue({ healthy: true });
  return { server, overall, authlete };
}

describe('HealthSection — the fields it reads back', () => {
  it('checks the server on mount and renders the uptime it was given', async () => {
    const { server, overall } = stubHealth();
    mountSection(<HealthSection />);

    await expectCall(server, 'the mount-time server health check');
    expect(overall, 'Redis status is supplementary but still fetched').toHaveBeenCalled();

    // 3725s formatted — the section owns this arithmetic, so a wrong `uptime` field reads as "Unknown".
    await expectReadsBack(/up 1h 2m 5s/, 'the server uptime');
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('reports the server as an error rather than silently Unknown when the check fails', async () => {
    vi.spyOn(healthService, 'serverHealth').mockRejectedValue(new Error('fetch failed'));
    vi.spyOn(healthService, 'overallHealth').mockResolvedValue(OVERALL_REDIS_UP);
    mountSection(<HealthSection />);

    await expectReadsBack(/fetch failed/, 'the server health failure');
    expect(await screen.findByText('Error')).toBeInTheDocument();
  });

  /**
   * Redis is the live session store on this deployment, so "Not Configured" and "Disconnected" are
   * genuinely different diagnoses — the first is a choice, the second is an outage.
   */
  it('distinguishes a disconnected Redis from an unconfigured one', async () => {
    vi.spyOn(healthService, 'serverHealth').mockResolvedValue(SERVER_OK);
    vi.spyOn(healthService, 'overallHealth').mockResolvedValue({
      ...OVERALL_REDIS_UP,
      checks: {
        redis: { healthy: false, connected: false, configured: true, error: 'ECONNREFUSED' },
      },
    });
    mountSection(<HealthSection />);

    expect(await screen.findByText('Disconnected')).toBeInTheDocument();
    await expectReadsBack(/ECONNREFUSED/, 'the Redis error the server reported');
  });

  /** The MCP class: a value the user set has to reach the service. */
  it('sends the extended flag the user ticked, rather than always the default', async () => {
    const { authlete } = stubHealth();
    mountSection(<HealthSection />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Extended check/i }));
    press(/Check Authlete Health/i);

    await waitFor(() => expect(authlete).toHaveBeenCalled());
    expect(
      authlete.mock.calls[0],
      'the checkbox becomes `?extended=true`; unticked it must not',
    ).toEqual([true]);
  });

  it('sends false when it is left unticked', async () => {
    const { authlete } = stubHealth();
    mountSection(<HealthSection />);
    press(/Check Authlete Health/i);

    await waitFor(() => expect(authlete).toHaveBeenCalled());
    expect(authlete.mock.calls[0]).toEqual([false]);
  });

  /**
   * A non-2xx is a health result, not a transport failure — so the status has to survive to the screen.
   * `statusHint` alone is what distinguishes a 429 rate limit from a credential problem, which on this
   * deployment is the single most confusing failure.
   */
  it('renders the HTTP status Authlete answered with, not just healthy/unhealthy', async () => {
    vi.spyOn(healthService, 'serverHealth').mockResolvedValue(SERVER_OK);
    vi.spyOn(healthService, 'overallHealth').mockResolvedValue(OVERALL_REDIS_UP);
    vi.spyOn(healthService, 'authleteHealth').mockResolvedValue(AUTHLETE_UNHEALTHY);
    mountSection(<HealthSection />);

    press(/Check Authlete Health/i);

    expect(await screen.findByText('Unhealthy')).toBeInTheDocument();
    await expectReadsBack(/HTTP 429/, 'the status code from the Authlete health result');
  });

  /**
   * **This test found a dead feature, and it is worth saying which.**
   *
   * `statusHint` explains a bare status when no error code could be extracted — and a 429 here means
   * Authlete's ~15-call rate limit, which is the single most confusing failure on this deployment. It
   * was written, unit-tested, and **unreachable**: `ErrorExplainer` is `decodeError`'s only caller,
   * none of its 46 usages passes `status`, and `decodeError` read one only from its object form. So the
   * whole status path was dead in the running app while `decode-error.test.ts` asserted it worked.
   *
   * Two things were wrong and both had to be fixed. `decodeError` now reads the status that
   * `describeError` already writes at the front of every error string; and `HealthSection` — the one
   * section that owns its own loading state and so uses neither `useAsyncCall` nor
   * `useDiscriminatedAsyncCall` — was setting `e.message`, the raw body with no status at all.
   *
   * A real `HttpError` is thrown rather than a hand-written string, so this drives the entire chain:
   * `HttpError` → `describeError` → `decodeError` → `statusHint` → the screen. A string literal would
   * have proved only the last two links, and the broken links were the first two.
   */
  it('explains a bare 429 with no error code in the body, which nothing could before', async () => {
    vi.spyOn(healthService, 'serverHealth').mockResolvedValue(SERVER_OK);
    vi.spyOn(healthService, 'overallHealth').mockResolvedValue(OVERALL_REDIS_UP);
    vi.spyOn(healthService, 'authleteHealth').mockRejectedValue(
      new HttpError({
        status: 429,
        statusText: 'Too Many Requests',
        headers: {},
        body: 'Too Many Requests',
        raw: 'Too Many Requests',
        durationMs: 12,
        ok: false,
      }),
    );
    mountSection(<HealthSection />);
    press(/Check Authlete Health/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
    // The hint's own words — proof that `statusHint` ran, not merely that some panel opened.
    await expectReadsBack(/Rate limited/i, 'the 429 status hint');
  });
});
