import { useSyncExternalStore } from 'react';
import { getTraces, subscribeToTraces, type TraceEntry } from '@/services/trace-store';

/**
 * Subscribe to the request trace.
 *
 * `useSyncExternalStore` rather than a `useState` + effect pair: the store is written from
 * `transport.ts`, which is a plain module with no relationship to the React tree, and a call can
 * outlive the component that started it. This is the supported way to read such a source without
 * tearing under concurrent rendering, and it needs the store to return a stable snapshot — which is why
 * `recordTrace` replaces the array rather than pushing into it.
 */
export function useTraces(): TraceEntry[] {
  return useSyncExternalStore(subscribeToTraces, getTraces, getTraces);
}
