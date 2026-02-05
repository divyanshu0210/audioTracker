import { create } from 'zustand';

const useNotificationStore = create(set => ({
  newAssignmentsFlag: false,
  notificationsCount:0,

  setNewAssignmentsFlag: value => set({ newAssignmentsFlag: value }),
  setNotificationsCount: value => set({ notificationsCount: value }),
}));

export default useNotificationStore;
