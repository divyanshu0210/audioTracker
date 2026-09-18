// useMenteeNoteCounts.js
//
// How many notes the selected mentee has written against each item, for the
// line under their rows.
//
// Filled once per mentee and read by source_id, which is the same shape as
// useAssignmentStatusStore next door and is read the same way - the two
// together are what a mentor scanning an assigned list actually wants: did it
// reach them, how much have they watched, and did they write anything.
//
// Refilled on exactly two events, both of which this one effect covers: the
// drawer picking a different mentee, and the native worker finishing a pass.
// Nothing else can change the table - the rows are written by the sync, never
// by this device.

import {useEffect} from 'react';
import {create} from 'zustand';
import {countMenteeNotesBySource} from '../database/menteeNotesDB';
import {useMenteeNotesStore} from './menteeNotesSync';
import useMentorMenteeStore from './useMentorMenteeStore';

export const useMenteeNoteCountStore = create(set => ({
  // The id rides along with the counts so nothing has to infer whose map this
  // is. Cleared rather than left behind when no mentee is selected: a stale map
  // would put one mentee's numbers under another's rows.
  menteeId: null,
  counts: {},
  setCounts: (menteeId, counts) => set({menteeId, counts}),
  clear: () => set({menteeId: null, counts: {}}),
}));

export const useMenteeNoteCounts = () => {
  const menteeId = useMentorMenteeStore(state => state.activeMentee?.id);

  // Bumped every time the worker finishes, which is the only way a new note of
  // theirs reaches this device.
  const syncedAt = useMenteeNotesStore(state => state.syncedAt);

  useEffect(() => {
    if (!menteeId) {
      useMenteeNoteCountStore.getState().clear();
      return;
    }

    // Whoever was selected before does not get to keep their numbers on the
    // new rows for the length of a query - the same reason the drawer clears
    // the assignment store before it loads the next mentee. Guarded on the id
    // so that a resync of the *same* mentee leaves the counts up rather than
    // blinking them away and putting them back.
    if (
      String(useMenteeNoteCountStore.getState().menteeId) !== String(menteeId)
    ) {
      useMenteeNoteCountStore.getState().clear();
    }

    let live = true;
    countMenteeNotesBySource(menteeId)
      .then(counts => {
        // The drawer can move on while this is in flight, and a late answer
        // about the previous mentee would land under the new one's rows.
        const stillSelected =
          String(useMentorMenteeStore.getState().activeMentee?.id) ===
          String(menteeId);
        if (live && stillSelected) {
          useMenteeNoteCountStore.getState().setCounts(menteeId, counts);
        }
      })
      .catch(error =>
        console.warn(
          'Could not count the mentee notes:',
          error?.message ?? error,
        ),
      );

    return () => {
      live = false;
    };
  }, [menteeId, syncedAt]);
};

export default useMenteeNoteCounts;
