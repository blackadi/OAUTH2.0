/**
 * The one place an HTTP request leaves this app, and the one place a response is read.
 *
 * **Why this exists.** Every service used to end with:
 *
 * ```ts
 * if (!response.ok) throw new Error(await response.text());
 * return response.json();
 * ```
 *
 * — nine times in `http.ts` alone and again in six other files. That line discards the status, the
 * status text and every response header at the transport boundary, so nothing downstream could tell
 * `400` from `401` from `429` from `500`. For a tool whose entire purpose is showing people what an
 * authorization server said, that is the load-bearing omission: `WWW-Authenticate` carries the whole
 * step-up and DPoP challenge mechanism (RFC 9470, RFC 9449 §8/§9), `DPoP-Nonce` carries the value a
 * client is required to replay, and `Retry-After` is the difference between "your secret is wrong" and
 * "you have hit Authlete's ~15-call rate limit". All three were invisible, and a user hitting the rate
 * limit saw the same red toast as a user with a bad client secret.
 *
 * Everything a response carries is now captured once, here, and recorded to the trace store — so the
 * request history, the status badges and the error decoder all read from the same capture rather than
 * each service re-deriving a fraction of it.
 *
 * **The public contract of `http.ts` is unchanged on purpose.** Its functions still resolve to the
 * parsed body and still reject with an error whose `message` is the response body verbatim, because
 * ~20 call sites do `toast.error(err)` and a dozen tests assert `rejects.toThrow(bodyText)`. The extra
 * detail arrives as *fields* on `HttpError`, which is additive: old code keeps working, new code can
 * read `err.status`.
 */

import { recordTrace } from './trace-store';

export interface HttpResult<T = unknown> {
  ok: boolean;
  status: number;
  statusText: string;
  /** Lower-cased header names, so `headers['www-authenticate']` is reliable. */
  headers: Record<string, string>;
  /** Parsed when the body is JSON, the raw string when it is not, `{}` when it is empty. */
  body: T;
  /** The body exactly as received, before any parsing. */
  raw: string;
  durationMs: number;
}

/**
 * A failed request, carrying everything the response said.
 *
 * `message` is the raw body, which is what `throw new Error(await response.text())` produced before —
 * so `toast.error(err.message)` and `rejects.toThrow(body)` behave exactly as they did.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly raw: string;
  readonly durationMs: number;

  constructor(result: HttpResult) {
    super(result.raw);
    this.name = 'HttpError';
    this.status = result.status;
    this.statusText = result.statusText;
    this.headers = result.headers;
    this.body = result.body;
    this.raw = result.raw;
    this.durationMs = result.durationMs;
  }
}

/** A network-level failure: no response at all, so there is no status to report. */
export class NetworkError extends Error {
  readonly durationMs: number;
  constructor(message: string, durationMs: number) {
    super(message);
    this.name = 'NetworkError';
    this.durationMs = durationMs;
  }
}

export interface SendInit {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** Short label for the trace timeline, e.g. `token: authorization_code`. */
  label?: string;
}

/**
 * Real `fetch` always gives a `Headers`. Several mocks in the existing suite are partial `Response`
 * literals that omit it, and a transport that throws on those would fail ~100 passing tests that are
 * otherwise testing the right thing. Absent headers read as `{}`; upgrading those mocks to full
 * `Response` shapes is a cheap follow-up, not a reason to hold this up.
 */
function readHeaders(response: Response): Record<string, string> {
  const out: Record<string, string> = {};
  const headers = response.headers as Headers | undefined;
  if (!headers?.forEach) return out;
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function parseBody(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Send a request and capture everything about it. **Never throws on an HTTP status** — a `401` is an
 * answer, and at a debugger's transport layer it is data, not an exception. Only a network failure
 * rejects, with `NetworkError`.
 */
export async function sendRaw(init: SendInit): Promise<HttpResult> {
  const startedAt = Date.now();
  const t0 = performance.now();

  let response: Response;
  try {
    response = await fetch(init.url, {
      method: init.method,
      ...(init.headers ? { headers: init.headers } : {}),
      ...(init.body !== undefined ? { body: init.body } : {}),
    });
  } catch (e: unknown) {
    const durationMs = performance.now() - t0;
    const message = e instanceof Error ? e.message : 'Network request failed';
    recordTrace({
      startedAt,
      durationMs,
      method: init.method,
      url: init.url,
      label: init.label,
      requestHeaders: init.headers ?? {},
      requestBody: init.body,
      status: 0,
      statusText: 'Network error',
      responseHeaders: {},
      responseBody: message,
      ok: false,
      networkError: message,
    });
    throw new NetworkError(message, durationMs);
  }

  const raw = await response.text();
  const durationMs = performance.now() - t0;

  const result: HttpResult = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText ?? '',
    headers: readHeaders(response),
    body: parseBody(raw),
    raw,
    durationMs,
  };

  recordTrace({
    startedAt,
    durationMs,
    method: init.method,
    url: init.url,
    label: init.label,
    requestHeaders: init.headers ?? {},
    requestBody: init.body,
    status: result.status,
    statusText: result.statusText,
    responseHeaders: result.headers,
    responseBody: result.body,
    ok: result.ok,
  });

  return result;
}

/**
 * `sendRaw`, but a non-2xx rejects with `HttpError`. This is what the `http.*` helpers use, so their
 * callers keep the throw-on-error behaviour they were written against.
 */
export async function send<T = unknown>(init: SendInit): Promise<HttpResult<T>> {
  const result = await sendRaw(init);
  if (!result.ok) throw new HttpError(result);
  return result as HttpResult<T>;
}

/** The body only — for the many call sites that legitimately want just that. */
export async function sendForBody<T = unknown>(init: SendInit): Promise<T> {
  return (await send<T>(init)).body;
}
