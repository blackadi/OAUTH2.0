import type { TraceEntry } from '@/services/trace-store';

/**
 * Progress through a multi-call protocol whose steps are rendered as tabs.
 *
 * **The gap this closes.** `FlowDiagram` and `flow-progress.ts` existed, were tested, and were applied
 * to **three of twenty** sections. Meanwhile eight sections rendered a strictly *ordered* sequence as a
 * row of peer tabs — and a tab bar says *"these are alternatives, pick one"*, which is the opposite of
 * what these protocols are:
 *
 * - **CIBA Core** is a four-call sequence: backchannel authentication → issue → poll → complete.
 * - **RFC 8628 §3.1–3.5** is a sequence: device authorization → user verification → completion → poll.
 * - **RFC 7591 → 7592**: `register` *mints the registration access token* that `get`, `update` and
 *   `delete` all require, so it is strictly first and the other three are unreachable without it.
 *
 * For a novice that is the difference between learning a protocol and learning a menu.
 *
 * **Derived from the request trace, not tracked in state** — the same decision, for the same reason, as
 * `flow-progress.ts`: a `useState` advanced by each handler puts the display and the reality in two
 * places, and they drift the moment a call fails or the page reloads. Reading the traffic means the
 * diagram cannot claim a step that produced no request.
 */

export interface SequenceStepSpec {
  id: string;
  label: string;
  description: string;
  /**
   * The path fragment whose successful call completes this step.
   *
   * A step with no endpoint is one this app cannot observe — the End-User typing a code into another
   * device, for instance. Those are marked complete only by inference from a later step, exactly as
   * `flow-progress.ts` back-fills login and consent from the arrival of a code.
   */
  endpoint?: string;
}

export interface SequenceProgress {
  completedSteps: string[];
  currentStep?: string;
  /** Step ids whose prerequisite has not happened yet. */
  blockedSteps: string[];
}

function succeeded(traces: TraceEntry[], endpoint: string): boolean {
  return traces.some((t) => t.ok && t.url.includes(endpoint));
}

/**
 * Which steps are done, which is next, and which cannot be reached yet.
 *
 * Steps are cumulative: a later success implies the earlier ones happened, because these protocols
 * cannot be entered in the middle. That is what lets an observable step vouch for an unobservable one
 * ahead of it in the list.
 */
export function sequenceProgress(
  steps: SequenceStepSpec[],
  traces: TraceEntry[],
): SequenceProgress {
  const done = steps.map((s) => (s.endpoint ? succeeded(traces, s.endpoint) : false));

  // Back-fill: if step N succeeded, everything before it must have happened, observable or not.
  const lastDone = done.lastIndexOf(true);
  const completed = steps.filter((_s, i) => i <= lastDone).map((s) => s.id);

  const nextIndex = lastDone + 1;
  const currentStep = nextIndex < steps.length ? steps[nextIndex].id : undefined;

  // Anything past the next step is unreachable: these are sequences, not a menu.
  const blockedSteps = steps.slice(nextIndex + 1).map((s) => s.id);

  return { completedSteps: completed, currentStep, blockedSteps };
}
