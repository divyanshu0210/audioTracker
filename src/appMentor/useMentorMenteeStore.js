import { create } from 'zustand';

const useMentorMenteeStore = create(set => ({
  mentors: [],
  mentees: [],
  selectedIds: [],
  userSelectionMode: false,
  selectedUsers: [],
  activeMentee :null,
  activeMentor :null,

  setMentors: mentors => set({ mentors }),
  setMentees: mentees => set({ mentees }),
  setSelectedIds: ids => set({ selectedIds: ids }),
  setUserSelectionMode: mode => set({ userSelectionMode: mode }),
  setSelectedUsers: items => set({ selectedUsers: items }),
  setActiveMentee: value => set({ activeMentee: value }),
  setActiveMentor: value => set({ activeMentor: value }),
  


  clearMentorshipState: () =>
    set({
      mentors: [],
      mentees: [],
      selectedIds: [],
      userSelectionMode: false,
      selectedUsers: [],
    }),
}));

export default useMentorMenteeStore;
