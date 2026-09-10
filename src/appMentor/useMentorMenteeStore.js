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
  // The category the drawer selected for the active mentor/mentee, so anything
  // that has to behave differently inside one can recognise it by id.
  //
  // By id rather than by name: a mentee category is tagged
  // ([MENTEE_CAT_Filter]) but a mentor category is just "Name (email)", which a
  // user could type themselves. And by comparison rather than a flag, because
  // CategorySelectionModal can change the selected category without the drawer
  // knowing - when it does, this simply stops matching.
  activeCategoryId: null,

  setMentors: mentors => set({ mentors }),
  setMentees: mentees => set({ mentees }),
  setSelectedIds: ids => set({ selectedIds: ids }),
  setUserSelectionMode: mode => set({ userSelectionMode: mode }),
  setSelectedUsers: items => set({ selectedUsers: items }),
  setActiveMentee: value => set({ activeMentee: value }),
  setActiveMentor: value => set({ activeMentor: value }),
  setIsLoading: isLoading => set({ isLoading }),
  setDrawerVisible: drawerVisible => set({ drawerVisible }),
  setActiveCategoryId: activeCategoryId => set({ activeCategoryId }),
  


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
