// useAssignmentInboxStore.js
//
// How many newly assigned items are waiting from each mentor, for the badge on
// the mentee's drawer.
//
// Assigned items no longer join the mentee's own tabs - they are filed under
// the mentor who sent them - so nothing on the home screen changes when a sync
// lands. This count is what remains: it sits there until the mentee actually
// opens that mentor.
//
// Kept on the device rather than derived from the server. "Delivered" is a
// fact about the assignment and the same for everyone; "I haven't looked at
// this yet" is a fact about this person on this phone.
//
// Counting is by assignment id, not by adding up totals, and that is the whole
// trick. A sync can be interrupted two ways - the network drops before the
// server is told what arrived, or the process dies just after. Adding totals
// gets both wrong: the first re-counts the same items on the next sync, the
// second never counts them at all. Recording which ids have been counted makes
// the operation idempotent, so replaying a sync converges instead of drifting,
// and no extra round trip is needed to find that out.

import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'assignmentInbox';

// Bounded so the ledger cannot grow forever. Far more than a mentee will ever
// have outstanding, and the oldest ids are the ones least likely to come round
// again - they were acknowledged long ago.
const MAX_COUNTED_IDS = 2000;

// Fire-and-forget: a failed write costs a badge, and blocking a sync on
// AsyncStorage to protect a counter would be the worse trade.
const persist = state => {
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      unreadByMentor: state.unreadByMentor,
      countedIds: state.countedIds,
    }),
  ).catch(error =>
    console.warn('Could not save the assignment inbox:', error),
  );
};

const useAssignmentInboxStore = create((set, get) => ({
  unreadByMentor: {},
  // Assignment ids already reflected in the counts above.
  countedIds: [],
  hydrated: false,
  // True while a sync is running, so the pill can say "Checking for new
  // assignments" rather than claiming a count it has not finished working out.
  isSyncing: false,

  // Until this runs the badges do not show, which is the right failure: a
  // missing badge is quieter than a wrong one.
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      set({
        unreadByMentor: saved?.unreadByMentor ?? {},
        countedIds: saved?.countedIds ?? [],
        hydrated: true,
      });
    } catch (error) {
      console.warn('Could not read the assignment inbox:', error);
      set({hydrated: true});
    }
  },

  setSyncing: isSyncing => set({isSyncing}),

  /**
   * Record that these assignments arrived from this mentor.
   *
   * Ids already in the ledger are ignored, so calling this twice for the same
   * sync - which is exactly what an interrupted one causes - counts them once.
   * Returns how many were actually new, for the toast.
   */
  recordDelivered: (mentorEmail, assignmentIds) => {
    if (!mentorEmail || !assignmentIds?.length) return 0;

    const {countedIds} = get();
    const seen = new Set(countedIds);
    const fresh = assignmentIds.filter(id => id != null && !seen.has(id));
    if (fresh.length === 0) return 0;

    set(state => {
      const next = {
        unreadByMentor: {
          ...state.unreadByMentor,
          [mentorEmail]: (state.unreadByMentor[mentorEmail] ?? 0) + fresh.length,
        },
        countedIds: [...state.countedIds, ...fresh].slice(-MAX_COUNTED_IDS),
      };
      persist(next);
      return next;
    });

    return fresh.length;
  },

  // The mentee opened this mentor. The ledger is deliberately left alone: it
  // is what stops an interrupted sync counting the same assignment twice, and
  // that has to keep holding after the badge is gone.
  clearUnread: mentorEmail => {
    if (!mentorEmail) return;
    set(state => {
      if (!state.unreadByMentor[mentorEmail]) return state;
      const unreadByMentor = {...state.unreadByMentor};
      delete unreadByMentor[mentorEmail];
      const next = {...state, unreadByMentor};
      persist(next);
      return {unreadByMentor};
    });
  },

  clearAll: () => {
    const next = {unreadByMentor: {}, countedIds: []};
    persist(next);
    set(next);
  },
}));

export default useAssignmentInboxStore;
