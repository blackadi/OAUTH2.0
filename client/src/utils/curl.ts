import { redactHeaders, redactBody } from '@/services/trace-store';

/**
 * Build a runnable `curl` command for a request.
 *
 * Two things the previous inline version in `RequestBuilder` got wrong, both of which matter because
 * the whole point of this button is that someone pastes the result somewhere:
 *
 * 1. **It embedded live credentials.** The generated command carried the real `Authorization: Basic`
 *    header, so a command pasted into a chat, an issue or a tutorial leaked the client secret. Redaction
 *    is now the default and revealing is a deliberate second choice — the same posture the trace panel
 *    takes, sharing one implementation so the two cannot disagree.
 * 2. **It did not quote.** The body was wrapped in single quotes with no escaping, so any `'` in a
 *    value — entirely legal in a `login_hint`, a `binding_message` or a RAR document — produced a
 *    command that silently ran with the wrong arguments or failed to parse.
 */
export interface CurlRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface CurlOptions {
  /** Include real credential values. Defaults to `false` — redacted. */
  revealSecrets?: boolean;
}

/**
 * POSIX single-quote escaping: wrap in `'…'` and replace each embedded `'` with `'\''`, which closes
 * the quote, emits an escaped quote, and reopens. Safe for every byte, including newlines.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function toCurl(request: CurlRequest, options: CurlOptions = {}): string {
  const reveal = options.revealSecrets ?? false;
  const headers = request.headers ?? {};
  const shownHeaders = reveal ? headers : redactHeaders(headers);
  const shownBody = reveal ? request.body : redactBody(request.body);

  const parts = [`curl -X ${request.method.toUpperCase()}`];
  for (const [name, value] of Object.entries(shownHeaders)) {
    parts.push(`  -H ${shellQuote(`${name}: ${value}`)}`);
  }
  if (shownBody) parts.push(`  -d ${shellQuote(shownBody)}`);
  parts.push(`  ${shellQuote(request.url)}`);

  return parts.join(' \\\n');
}
