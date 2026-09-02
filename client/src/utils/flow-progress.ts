import type { TraceEntry } from '@/services/trace-store';

/**
 * Where a flow has got to, derived from the requests that were actually made.
 *
 * **Why derive it rather than track it.** `FlowDiagram` has supported `completedSteps` since it was
 * written and no call site ever passed one, so every step was drawn as pending and the diagram jumped
 * to the last one once a token existed. The obvious fix — a `useState` per section advanced by each
 * handler — puts the display and the reality in two places, and they drift the moment a request fails,
 * a page is reloaded, or a step happens in another tab (which is exactly what the authorization
 * redirect does).
 *
 * The request trace is already the record of what happened. Reading progress out of it means the
 * diagram cannot claim a step that produced no request, and it survives the redirect that carries the
 * user away and back.
 *
 * **What it can and cannot see.** Login and consent happen on the server, in pages this app does not
 * render, so no request of ours observes them. They are marked complete when an authorization *code*
 * comes back, because a code is proof that both happened — an inference, and a sound one, rather than a
 * guess. It is recorded here rather than left implicit because a reader comparing the diagram against
 * the trace will otherwise wonder where those two ticks came from.
 */

export interface FlowProgress {
  completedSteps: string[];
  currentStep?: string;
}

/**
 * A hop that reached the authorization endpoint, i.e. the flow was actually started.
 *
 * **This predicate could not be true until front-channel hops were recorded.** The authorization
 * request is `window.location.href = url`, a browser navigation, and `recordTrace` was only ever called
 * from `transport.ts` — so no trace entry ever had an `/api/authorization` URL and this function always
 * returned `false`. It was harmless because `authorizeSent` reads session storage instead, but it is the
 * clearest evidence that the missing trace went unnoticed. `recordNavigation` now writes both hops, so
 * the check works for the reason it was written.
 *
 * **And it is now true on the callback page too, which it was not when this was written.** The
 * outbound hop is recorded microseconds before `window.location.href` discards the document, so while
 * the trace lived only in memory this predicate went back to `false` the instant the browser left —
 * `hasCallbackRedirect` was all that survived the round trip, and `authorizeSent` (session storage)
 * carried the fact across instead. `trace-store.ts` now persists to `sessionStorage`, so both hops are
 * present on the callback page and the two sources agree rather than one covering for the other.
 */
function hasAuthorizeRequest(traces: TraceEntry[]): boolean {
  return traces.some((t) => t.url.includes('/api/authorization'));
}

/**
 * The inbound redirect carrying the code back — the second front-channel hop.
 *
 * Read from the trace rather than from `hasToken`, so the callback step is complete as soon as the
 * browser came back, even if the exchange then failed. That distinction matters: a flow that reaches the
 * callback and fails at the token endpoint has genuinely completed four of five steps, and a diagram
 * that showed it as stalled at step one would send the reader looking in the wrong place.
 */
function hasCallbackRedirect(traces: TraceEntry[]): boolean {
  return traces.some((t) => t.navigation && t.direction === 'inbound');
}

function successfulTokenCall(traces: TraceEntry[]): boolean {
  return traces.some((t) => t.ok && /\/api\/token(\?|$)/.test(t.url) && t.method === 'POST');
}

function failedTokenCall(traces: TraceEntry[]): boolean {
  return traces.some((t) => !t.ok && /\/api\/token(\?|$)/.test(t.url) && t.method === 'POST');
}

export interface FlowInputs {
  traces: TraceEntry[];
  /** True once a token set is held. */
  hasToken: boolean;
  /** True when the callback saw a `code` — set by the callback page. */
  codeReceived: boolean;
  /** True while the authorization request has been sent but no code has come back. */
  authorizeSent: boolean;
}

/**
 * The authorization-code flow: authorize → login → consent → callback → token.
 *
 * Steps are cumulative: reaching a later one implies the earlier ones happened, which is why the code's
 * arrival back-fills login and consent.
 */
export function authorizationCodeProgress(inputs: FlowInputs): FlowProgress {
  const { traces, hasToken, codeReceived, authorizeSent } = inputs;
  const completed: string[] = [];

  if (authorizeSent || codeReceived || hasToken || hasAuthorizeRequest(traces)) {
    completed.push('authz');
  }
  if (codeReceived || hasToken || hasCallbackRedirect(traces)) {
    // A code is proof the End-User authenticated and consented; neither produces a request we see.
    // The inbound redirect is now recorded, so this is observed from the traffic as well as inferred.
    completed.push('login', 'consent', 'callback');
  }
  if (hasToken && successfulTokenCall(traces)) completed.push('token');
  // A token held from an earlier session, with no token call in this trace, still means the step is done.
  else if (hasToken) completed.push('token');

  const current = completed.includes('token')
    ? undefined
    : completed.includes('callback')
      ? 'token'
      : completed.includes('authz')
        ? 'login'
        : 'authz';

  return { completedSteps: completed, currentStep: current };
}

/** The two-step flows — client credentials, password, refresh, JWT bearer. */
export function twoStepProgress(
  inputs: Pick<FlowInputs, 'traces' | 'hasToken'>,
  firstStepId: string,
): FlowProgress {
  const { traces, hasToken } = inputs;
  const attempted = successfulTokenCall(traces) || failedTokenCall(traces);
  const completed: string[] = [];

  // The first step of these flows is "assemble credentials", which is complete as soon as a request
  // was sent — success or failure. Only the token step distinguishes the two.
  if (attempted || hasToken) completed.push(firstStepId);
  if (hasToken && successfulTokenCall(traces)) completed.push('token');

  return {
    completedSteps: completed,
    currentStep: completed.includes('token') ? undefined : completed.length ? 'token' : firstStepId,
  };
}
