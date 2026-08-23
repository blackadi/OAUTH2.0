import { describe, it, expect } from 'vitest';
import { sequenceProgress, type SequenceStepSpec } from '@/utils/sequence-progress';
import type { TraceEntry } from '@/services/trace-store';

/**
 * Progress through a protocol that was being rendered as a menu.
 *
 * `FlowDiagram` and `flow-progress.ts` existed, were tested, and were applied to three of twenty
 * sections — while eight rendered a strictly ordered sequence as a row of peer tabs. CIBA Core is a
 * four-call sequence; RFC 8628 §3.1–3.5 is a sequence; and RFC 7591's `register` *mints the token* that
 * RFC 7592's read, update and delete all require.
 */

const STEPS: SequenceStepSpec[] = [
  { id: 'a', label: 'A', description: 'first', endpoint: '/api/a' },
  { id: 'b', label: 'B', description: 'second', endpoint: '/api/b' },
  { id: 'c', label: 'C', description: 'third', endpoint: '/api/c' },
];

function trace(url: string, ok = true): TraceEntry {
  return {
    id: url,
    startedAt: 0,
    durationMs: 1,
    method: 'POST',
    url: `http://localhost:3000${url}`,
    requestHeaders: {},
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    responseHeaders: {},
    responseBody: {},
    ok,
  };
}

describe('sequenceProgress', () => {
  it('starts with nothing done and the first step current', () => {
    const p = sequenceProgress(STEPS, []);
    expect(p.completedSteps).toEqual([]);
    expect(p.currentStep).toBe('a');
    // A sequence, not a menu: everything past the next step is out of reach.
    expect(p.blockedSteps).toEqual(['b', 'c']);
  });

  it('advances one step per successful call', () => {
    const p = sequenceProgress(STEPS, [trace('/api/a')]);
    expect(p.completedSteps).toEqual(['a']);
    expect(p.currentStep).toBe('b');
    expect(p.blockedSteps).toEqual(['c']);
  });

  /**
   * A failed call must not advance the diagram. This is the whole reason progress is read from the
   * trace rather than from a counter each handler increments — a handler that fired is not a step that
   * succeeded, and the two drift the first time anything goes wrong.
   */
  it('does not advance on a failed call', () => {
    const p = sequenceProgress(STEPS, [trace('/api/a', false)]);
    expect(p.completedSteps).toEqual([]);
    expect(p.currentStep).toBe('a');
  });

  /**
   * Back-filling is what lets an observable step vouch for one this app cannot see — the End-User
   * typing a code into another device, in RFC 8628 §3.4. These protocols cannot be entered in the
   * middle, so a later success proves the earlier steps happened.
   */
  it('back-fills earlier steps from a later success', () => {
    const p = sequenceProgress(STEPS, [trace('/api/c')]);
    expect(p.completedSteps).toEqual(['a', 'b', 'c']);
    expect(p.currentStep).toBeUndefined();
    expect(p.blockedSteps).toEqual([]);
  });

  it('treats a step with no endpoint as unobservable rather than as done', () => {
    const withGap: SequenceStepSpec[] = [
      { id: 'a', label: 'A', description: 'first', endpoint: '/api/a' },
      { id: 'offline', label: 'Offline', description: 'happens elsewhere' },
      { id: 'c', label: 'C', description: 'third', endpoint: '/api/c' },
    ];
    const afterFirst = sequenceProgress(withGap, [trace('/api/a')]);
    expect(afterFirst.completedSteps).toEqual(['a']);
    expect(afterFirst.currentStep).toBe('offline');

    // The unobservable step is vouched for once the step after it succeeds.
    const afterLast = sequenceProgress(withGap, [trace('/api/a'), trace('/api/c')]);
    expect(afterLast.completedSteps).toEqual(['a', 'offline', 'c']);
  });

  it('ignores calls to endpoints outside the sequence', () => {
    const p = sequenceProgress(STEPS, [trace('/api/health'), trace('/api/metrics')]);
    expect(p.completedSteps).toEqual([]);
    expect(p.currentStep).toBe('a');
  });

  it('is stable when the same step succeeds more than once', () => {
    const p = sequenceProgress(STEPS, [trace('/api/a'), trace('/api/a')]);
    expect(p.completedSteps).toEqual(['a']);
    expect(p.currentStep).toBe('b');
  });
});
