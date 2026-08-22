import { useSyncExternalStore } from 'react';
import { getAnnouncement, subscribeToAnnouncements } from '@/services/announcer';

/**
 * The two live regions for the whole application, mounted once in `AppLayout`.
 *
 * **Both regions exist at all times and are never conditionally rendered.** A live region has to be in
 * the accessibility tree *before* its content changes, or the change is not announced — mounting a
 * region and filling it in the same commit is the single most common way live regions are got wrong.
 * Only the text inside changes.
 *
 * Two regions rather than one because `aria-live` cannot be switched per message: a screen reader binds
 * the politeness when the region is created. Results go to the polite one, failures to the assertive
 * one. See `services/announcer.ts` for why failures are the only thing allowed to interrupt.
 */
function LiveAnnouncer() {
  const announcement = useSyncExternalStore(
    subscribeToAnnouncements,
    getAnnouncement,
    getAnnouncement,
  );

  const polite = announcement.politeness === 'polite' ? announcement.message : '';
  const assertive = announcement.politeness === 'assertive' ? announcement.message : '';

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </>
  );
}

export { LiveAnnouncer };
