import { generateCodeChallenge } from '@/pkce';
import { getTraces, type TraceEntry } from '@/services/trace-store';

/**
 * Answer the question the error message asks the user to answer by hand.
 *
 * **The gap this closes.** `ErrorExplainer` takes a **string**, and `decode-error.ts` never reads the
 * trace store. So on `invalid_grant` the fix text said *"check that `redirect_uri` is byte-identical to
 * the one in the authorization request, and that the PKCE verifier matches the challenge that was
 * sent"* — asking the reader to compare two values the application was already holding. The
 * authorization request is in the trace (since front-channel hops are recorded) and so is the token
 * request body. Both comparisons are mechanical.
 *
 * `invalid_grant` is the error that most deserves this: RFC 6749 §5.2 gives it *six* distinct causes,
 * the response never says which, and two of the six are exactly diffable.
 *
 * **Never guesses.** Every check reports `inconclusive` when the evidence is not in the trace, and says
 * why. A confident wrong diagnosis in a teaching tool is worse than no diagnosis, because the reader has
 * no way to tell them apart — the same rule `decode-error.ts` follows for unrecognised codes.
 */

export type DiagnosisVerdict = 'match' | 'mismatch' | 'inconclusive';

export interface DiagnosisCheck {
  /** What was compared, in the reader's terms. */
  title: string;
  verdict: DiagnosisVerdict;
  /** The finding, including both values when they differ. */
  detail: string;
  spec?: string;
}

/** The most recent front-channel hop out to the authorization endpoint. */
function lastAuthorizeRequest(traces: TraceEntry[]): URL | null {
  const hop = traces.find((t) => t.navigation && t.url.includes('/api/authorization'));
  if (!hop) return null;
  try {
    return new URL(hop.url);
  } catch {
    return null;
  }
}

/** The most recent token request body, parsed. */
function lastTokenRequest(traces: TraceEntry[]): URLSearchParams | null {
  const call = traces.find(
    (t) => !t.navigation && t.method === 'POST' && /\/api\/token(\?|$)/.test(t.url),
  );
  if (!call?.requestBody) return null;
  return new URLSearchParams(call.requestBody);
}

/**
 * RFC 7636 §4.6: the server recomputes the transform and refuses with `invalid_grant` when the values
 * are not equal. Recomputing it here says *which* of the two is wrong, which the server never does.
 */
async function checkPkce(
  authz: URL | null,
  token: URLSearchParams | null,
): Promise<DiagnosisCheck> {
  const spec = 'RFC 7636 §4.6';
  const challenge = authz?.searchParams.get('code_challenge');
  const method = authz?.searchParams.get('code_challenge_method') ?? 'plain';
  const verifier = token?.get('code_verifier');

  if (!challenge && !verifier) {
    return {
      title: 'PKCE',
      verdict: 'inconclusive',
      detail:
        'Neither request carried PKCE parameters, so there is nothing to compare. If the client requires PKCE, the refusal will name that instead.',
      spec,
    };
  }
  if (!challenge) {
    return {
      title: 'PKCE',
      verdict: 'mismatch',
      detail:
        'The token request sent a `code_verifier` but the authorization request carried no `code_challenge`. There is nothing for the server to compare it against, and it will refuse rather than ignore it.',
      spec,
    };
  }
  if (!verifier) {
    return {
      title: 'PKCE',
      verdict: 'mismatch',
      detail:
        'The authorization request carried a `code_challenge` but the token request sent no `code_verifier`, so the proof PKCE requires was never presented.',
      spec,
    };
  }

  // `plain` means the challenge *is* the verifier; `S256` means it is the base64url SHA-256 of it.
  const derived = method === 'plain' ? verifier : await generateCodeChallenge(verifier);
  if (derived === challenge) {
    return {
      title: 'PKCE',
      verdict: 'match',
      detail: `The \`code_verifier\` sent does transform to the \`code_challenge\` from step 1 under \`${method}\`, so PKCE is not what this refusal is about.`,
      spec,
    };
  }
  return {
    title: 'PKCE',
    verdict: 'mismatch',
    detail: `The \`code_verifier\` sent transforms to \`${derived}\` under \`${method}\`, but step 1 sent \`code_challenge=${challenge}\`. That difference is exactly what PKCE is for — the server is refusing because the party redeeming the code cannot prove it is the party that requested it.`,
    spec,
  };
}

/**
 * RFC 6749 §4.1.3 requires the two `redirect_uri` values to be *identical*, and a trailing slash or a
 * percent-encoding difference is enough. The error says nothing about the URI, which is why this one
 * costs people an afternoon.
 */
function checkRedirectUri(authz: URL | null, token: URLSearchParams | null): DiagnosisCheck {
  const spec = 'RFC 6749 §4.1.3';
  const fromAuthz = authz?.searchParams.get('redirect_uri');
  const fromToken = token?.get('redirect_uri');

  if (!fromAuthz || !fromToken) {
    return {
      title: 'redirect_uri',
      verdict: 'inconclusive',
      detail:
        'One of the two requests is not in this trace, so the pair cannot be compared. Run the flow again from Grant Flows with the trace panel open.',
      spec,
    };
  }
  if (fromAuthz === fromToken) {
    return {
      title: 'redirect_uri',
      verdict: 'match',
      detail: 'Both requests carried the same value, byte for byte.',
      spec,
    };
  }
  return {
    title: 'redirect_uri',
    verdict: 'mismatch',
    detail: `Step 1 sent \`${fromAuthz}\` and the token request sent \`${fromToken}\`. The specification requires the two to be identical — "and their values MUST be identical" — so a trailing slash, a different port or a percent-encoding difference is enough to earn this refusal.`,
    spec,
  };
}

/** Whether the client was the same in both requests. Cheap, and occasionally the whole answer. */
function checkClientId(authz: URL | null, token: URLSearchParams | null): DiagnosisCheck {
  const fromAuthz = authz?.searchParams.get('client_id');
  const fromToken = token?.get('client_id');
  if (!fromAuthz || !fromToken) {
    return {
      title: 'client_id',
      verdict: 'inconclusive',
      detail: 'Not present in both requests in this trace.',
      spec: 'RFC 6749 §4.1.3',
    };
  }
  if (fromAuthz === fromToken) {
    return {
      title: 'client_id',
      verdict: 'match',
      detail: `Both requests named \`${fromAuthz}\`.`,
      spec: 'RFC 6749 §4.1.3',
    };
  }
  return {
    title: 'client_id',
    verdict: 'mismatch',
    detail: `Step 1 named \`${fromAuthz}\` and the token request named \`${fromToken}\`. A code issued to one client cannot be redeemed by another.`,
    spec: 'RFC 6749 §4.1.3',
  };
}

/**
 * Which OAuth errors this can say something useful about.
 *
 * Kept narrow on purpose. Offering to diagnose `server_error` would produce three inconclusive rows and
 * teach the reader that the feature is noise.
 */
export const DIAGNOSABLE_ERRORS = new Set(['invalid_grant', 'invalid_request']);

export function canDiagnose(oauthError: string | undefined): boolean {
  return Boolean(oauthError && DIAGNOSABLE_ERRORS.has(oauthError));
}

/**
 * Compare the authorization-code exchange against the authorization request that produced the code.
 *
 * Reads the live trace store by default so the caller does not have to thread it through; the parameter
 * exists for tests.
 */
export async function diagnoseCodeExchange(
  traces: TraceEntry[] = getTraces(),
): Promise<DiagnosisCheck[]> {
  const authz = lastAuthorizeRequest(traces);
  const token = lastTokenRequest(traces);

  if (!authz && !token) {
    return [
      {
        title: 'No evidence in this trace',
        verdict: 'inconclusive',
        detail:
          'Neither the authorization request nor the token request is in the request trace, so there is nothing to compare. Both are recorded when the flow is run from Grant Flows in this tab.',
      },
    ];
  }

  return [
    checkRedirectUri(authz, token),
    await checkPkce(authz, token),
    checkClientId(authz, token),
  ];
}
