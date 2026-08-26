import * as z from 'zod/mini';
import {
  redactBody,
  redactHeaders,
  type TraceEntry,
  type TraceInput,
} from '@/services/trace-store';

/**
 * A run, as a file: exported so somebody else can open it, and read back so they can.
 *
 * **Why this is not the Markdown export.** `TracePanel.toMarkdown` already produces a document you can
 * paste into a chat or an issue, and it should stay — it is a *rendering*, meant for a person, and it is
 * the right artefact for "look at this failing flow". What it is not is data. Nothing could read one
 * back, so a run was shareable only as prose: the recipient could see the exchange but could not put it
 * into the tool and click through it.
 *
 * Parsing the Markdown back would have been the wrong repair. A rendering is lossy on purpose — headings
 * collapse the status and the path into one line, bodies are fenced without their content type — and a
 * parser for it would break every time the prose improved. So there are two artefacts with two jobs:
 * Markdown to read, JSON to load.
 *
 * ## Three decisions worth knowing before changing this
 *
 * - **Redacted on export, unconditionally.** Same rule as the Markdown export and for the same reason:
 *   an exported run *travels*, and there is no per-entry reveal decision left to honour once it has left
 *   the tab. `Authorization`, `DPoP` and `Cookie` are masked by `redactHeaders`, and credential-bearing
 *   form fields by `redactBody` — the two functions the panel and "copy as cURL" already share, rather
 *   than a third implementation that could drift from them.
 * - **Validated on import, because a file is untrusted input.** This is a transport boundary in every
 *   sense that matters, so it gets a schema like the ones in `schemas.ts`, and follows the same
 *   loose-never-strict rule: a run file written by a newer build will carry members this one has never
 *   heard of, and rejecting it for that would make a forward-compatible format backward-breaking.
 * - **An imported entry is marked as imported and never loses that mark.** This is the one that would
 *   cause real harm if it were wrong. A trace panel showing somebody else's requests as though they were
 *   yours is worse than no import at all: you would debug traffic your own build never sent. The flag
 *   travels on the entry rather than living in the panel's state, so nothing can render an imported run
 *   without knowing it is one.
 */

export const RUN_FILE_FORMAT = 'oauth-debugger-run';

/**
 * Bumped only for a change a **reader** cannot cope with.
 *
 * Adding a member is not that — the schema is loose, so an older reader ignores what it does not know.
 * Removing one, or changing what one means, is.
 */
export const RUN_FILE_VERSION = 1;

export interface RunFile {
  format: typeof RUN_FILE_FORMAT;
  version: number;
  /** ISO 8601. Informational — the entries carry their own `startedAt`. */
  exportedAt: string;
  entries: TraceEntry[];
}

/**
 * Loose, per `schemas.ts`'s first rule, and for the same reason one layer over.
 *
 * Only the members a reader must have to render a row are required. `label`, `networkError`,
 * `navigation` and `direction` are all genuinely optional on a live entry, so requiring any of them here
 * would reject a file this app itself had just written.
 */
const TraceEntrySchema = z.looseObject({
  id: z.string(),
  startedAt: z.number(),
  durationMs: z.number(),
  method: z.string(),
  url: z.string(),
  label: z.optional(z.string()),
  requestHeaders: z.record(z.string(), z.string()),
  requestBody: z.optional(z.string()),
  status: z.number(),
  statusText: z.string(),
  responseHeaders: z.record(z.string(), z.string()),
  responseBody: z.unknown(),
  ok: z.boolean(),
  networkError: z.optional(z.string()),
  navigation: z.optional(z.boolean()),
  direction: z.optional(z.union([z.literal('outbound'), z.literal('inbound')])),
});

const RunFileSchema = z.looseObject({
  format: z.literal(RUN_FILE_FORMAT),
  version: z.number(),
  exportedAt: z.optional(z.string()),
  entries: z.array(TraceEntrySchema),
});

/** Thrown with a sentence a person can act on — the panel shows this text verbatim. */
export class RunFileError extends Error {}

/**
 * Build the file. `now` is a parameter rather than a `Date.now()` call so the output is a pure function
 * of its inputs, which is what makes the round-trip testable without freezing time.
 */
export function toRunFile(entries: TraceEntry[], now: Date): RunFile {
  return {
    format: RUN_FILE_FORMAT,
    version: RUN_FILE_VERSION,
    exportedAt: now.toISOString(),
    entries: entries.map((entry) => ({
      ...entry,
      requestHeaders: redactHeaders(entry.requestHeaders),
      requestBody: redactBody(entry.requestBody),
      // Response headers are not redacted — and that is deliberate, not an omission. `WWW-Authenticate`
      // and `DPoP-Nonce` are the whole step-up and DPoP challenge mechanism, they are what a recipient
      // needs to see, and neither is a credential *of the sender*. The panel makes the same call.
    })),
  };
}

export function serializeRunFile(entries: TraceEntry[], now: Date): string {
  return JSON.stringify(toRunFile(entries, now), null, 2);
}

/**
 * Read a run file, or throw a sentence explaining why not.
 *
 * Order matters here: bad JSON, then wrong document, then unreadable version, then shape. Reporting
 * "entries is missing" for a file that is actually a HAR export, or for a screenshot somebody renamed,
 * sends the reader looking in the wrong place.
 */
export function parseRunFile(text: string): { entries: TraceInput[]; version: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new RunFileError(
      'That file is not JSON. Export a run with the Export button to get one.',
    );
  }

  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as { format?: unknown }).format !== RUN_FILE_FORMAT
  ) {
    throw new RunFileError(
      `That is not a saved run — a run file starts with "format": "${RUN_FILE_FORMAT}".`,
    );
  }

  const version = (raw as { version?: unknown }).version;
  if (typeof version !== 'number' || version > RUN_FILE_VERSION) {
    throw new RunFileError(
      `That run was saved by a newer version of this tool (format ${String(version)}; this build reads ${RUN_FILE_VERSION}).`,
    );
  }

  const parsed = RunFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RunFileError(
      `That run file is malformed: ${parsed.error.issues[0]?.message ?? 'unknown'}.`,
    );
  }

  /**
   * `id` is dropped on the way in.
   *
   * The store mints its own ids from a counter, and keeping the file's would let two entries collide —
   * with each other, or with a live request recorded after the import. `TraceInput` is `TraceEntry`
   * without the id precisely so the compiler makes that decision here rather than leaving it to whoever
   * calls this next.
   */
  return {
    version,
    entries: parsed.data.entries.map(({ id: _id, ...entry }) => ({
      ...(entry as Omit<TraceEntry, 'id'>),
      imported: true,
    })),
  };
}
