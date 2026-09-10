import { create } from 'zustand';

const useMentorMenteeStore = create(set => ({
  mentors: [],
  mentees: [],
  selectedIds: [],
  userSelectionMode: false,
  selectedUsers: [],
  activeMentee :null,
  activeMentor :null,
  // MentorMenteeDrawer has always read this to decide between a spinner and
  // the tabs — it just never existed here, so it was permanently undefined and
  // the drawer went straight to an empty "No mentees found." while the fetch
  // was still in flight.
  isLoading: false,
  // In the store rather than local to MentorMenteeDrawer because the New
  // Assignments button opens it: after a sync the mentor list, with its
  // unread badges, is the only place the new items are visible.
  drawerVisible: false,

  setMentors: mentors => set({ mentors }),
  setMentees: mentees => set({ mentees }),
  setSelectedIds: ids => set({ selectedIds: ids }),
  setUserSelectionMode: mode => set({ userSelectionMode: mode }),
  setSelectedUsers: items => set({ selectedUsers: items }),
  setActiveMentee: value => set({ activeMentee: value }),
  setActiveMentor: value => set({ activeMentor: value }),
  setIsLoading: isLoading => set({ isLoading }),
  setDrawerVisible: drawerVisible => set({ drawerVisible }),
  


  clearMentorshipState: () =>
    set({
      mentors: [],
      mentees: [],
      selectedIds: [],
      userSelectionMode: false,
      selectedUsers: [],
      isLoading: false,
    }),
}));

export default useMentorMenteeStore;
