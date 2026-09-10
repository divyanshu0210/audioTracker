// useAssignmentStatusStore.js
//
// Delivery state and watch progress for the assignments a mentor gave one
// mentee, keyed by the video id the assignment was created with.
//
// It lives in a store rather than being passed down because the rows that show
// it are the mentor's ordinary item rows — BaseItem renders them for every
// list in the app, and threading a prop from the drawer down to there would
// mean touching every list in between for something only one screen uses.
//
// Empty is the normal state. Only a mentor who has selected a mentee fills it,
// and selecting anyone else clears it, so no row shows a tick or a bar unless
// it is genuinely being viewed as that mentee's assignment.

import {create} from 'zustand';

const useAssignmentStatusStore = create(set => ({
  // Which mentee the current contents describe, so a stale response from a
  // previous selection can be recognised and dropped.
  menteeId: null,
  byVideoId: {},
  isLoading: false,

  setLoading: isLoading => set({isLoading}),

  // Keyed under both ids an assignment can be known by. They are the same for
  // YouTube, Drive and Iskcon; a device file was assigned as its Drive copy,
  // so the mentee's id is that copy while the mentor's own row is still the
  // device file — see origin_video_id in the backend model.
  setForMentee: (menteeId, assignments) =>
    set({
      menteeId,
      isLoading: false,
      byVideoId: (assignments ?? []).reduce((map, assignment) => {
        map[String(assignment.video_id)] = assignment;
        if (assignment.origin_video_id) {
          map[String(assignment.origin_video_id)] = assignment;
        }
        return map;
      }, {}),
    }),

  clear: () => set({menteeId: null, byVideoId: {}, isLoading: false}),
}));

export default useAssignmentStatusStore;
