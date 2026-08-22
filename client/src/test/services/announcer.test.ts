import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  announce,
  getAnnouncement,
  resetAnnouncements,
  subscribeToAnnouncements,
} from '@/services/announcer';

/**
 * The store behind the two live regions.
 *
 * Before it, `aria-live` and `role="status"` appeared **zero** times in the application and the only
 * three `role="alert"`s were field-error spans. Every section works by rendering an async response into
 * a pane, so a screen-reader user was never told a response had arrived, failed, or was on its way — in
 * a product where the response *is* the content.
 */

beforeEach(() => {
  resetAnnouncements();
});

describe('announcer', () => {
  it('starts empty, so nothing is announced on first paint', () => {
    expect(getAnnouncement().message).toBe('');
  });

  it('records the message and its politeness', () => {
    announce('Request succeeded.', 'polite');
    expect(getAnnouncement()).toMatchObject({
      message: 'Request succeeded.',
      politeness: 'polite',
    });

    announce('Request failed.', 'assertive');
    expect(getAnnouncement()).toMatchObject({
      message: 'Request failed.',
      politeness: 'assertive',
    });
  });

  it('defaults to polite, because only a failure earns an interruption', () => {
    announce('something happened');
    expect(getAnnouncement().politeness).toBe('polite');
  });

  /**
   * The monotonic id is the whole reason the shape is an object rather than a string. A screen reader
   * announces a live region when its *content changes*; running the same operation twice produces the
   * same sentence, and without a changing snapshot `useSyncExternalStore` would see no change and the
   * second outcome would be announced as silence.
   */
  it('changes the snapshot even when the same text is announced twice', () => {
    announce('Request failed. 401 Unauthorized', 'assertive');
    const first = getAnnouncement();
    announce('Request failed. 401 Unauthorized', 'assertive');
    const second = getAnnouncement();

    expect(second.message).toBe(first.message);
    expect(second.id).toBe(first.id + 1);
    expect(second).not.toBe(first);
  });

  it('ignores an empty message rather than clearing the region', () => {
    announce('still here');
    const before = getAnnouncement();
    announce('');
    expect(getAnnouncement()).toBe(before);
  });

  it('notifies subscribers and stops on unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAnnouncements(listener);

    announce('one');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    announce('two');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('returns a stable snapshot between announcements, so React does not re-render forever', () => {
    announce('stable');
    expect(getAnnouncement()).toBe(getAnnouncement());
  });
});
