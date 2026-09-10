// useMenteeStatusRefresh.js
//
// A mentor looking at a mentee's rows is looking at something that changes on
// someone else's phone: their device builds the item (delivered), they open the
// mentor (seen), they play it (watch progress). None of that reaches this
// device on its own. The ticks and bars were fetched once, when the mentee was
// picked in the drawer, and then stood still for as long as the mentor kept
// looking — a mentee could receive a file and watch half of it while the
// mentor's screen still showed a single grey tick.
//
// So ask again, but only while it is worth asking: with a mentee selected, and
// with the app actually in front of the person. Mounted once, in
// GlobalListeners, because the rows this feeds are ordinary item rows that
// appear on nearly every screen — there is no one screen to hang it off.

import {useCallback, useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {useAppState} from '../contexts/AppStateContext';
import useMentorMenteeStore from './useMentorMenteeStore';
import {refreshMenteeStatus} from '../appMentorBackend/assignmentsMgt';

// Slow enough to be nothing on a battery, quick enough that a mentor who has
// just told a mentee to open something sees it arrive while they are still
// looking. One small request per tick, and only for the selected mentee.
export const MENTEE_REFRESH_INTERVAL_MS = 30000;

/**
 * Run `refresh` on the shared mentee cadence for as long as `enabled` holds.
 *
 * One cadence for every surface a mentor watches a mentee through - the ticks
 * on the item rows, the day report, the calendar - so nothing on screen is
 * older than anything else next to it.
 *
 * `enabled` false costs nothing, which is the normal case: most of this app's
 * life is somebody looking at their own files.
 */
export function useMenteeRefresh(refresh, enabled) {
  // Held in a ref so a caller can pass a fresh closure on every render without
  // tearing down and restarting the interval underneath it.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      // setInterval keeps firing while the app is backgrounded on Android.
      // Nothing is on screen to update, so the request would be pure waste.
      if (AppState.currentState !== 'active') return;
      refreshRef.current();
    }, MENTEE_REFRESH_INTERVAL_MS);

    // Coming back to the app is exactly when what is on screen is most likely
    // to be stale, and it is the stretch the interval above deliberately sat
    // out. Don't wait up to another full interval to correct it.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshRef.current();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled]);
}

export default function useMenteeStatusRefresh() {
  const {userInfo} = useAppState();
  const mentorId = userInfo?.id;
  const menteeId = useMentorMenteeStore(state => state.activeMentee?.id);

  useMenteeRefresh(
    useCallback(
      () => refreshMenteeStatus(mentorId, menteeId),
      [mentorId, menteeId],
    ),
    Boolean(mentorId && menteeId),
  );
}
