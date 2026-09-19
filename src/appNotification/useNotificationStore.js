import { create } from 'zustand';

const useNotificationStore = create(set => ({
  notificationsCount:0,

  setNotificationsCount: value => set({ notificationsCount: value }),
}));

export default useNotificationStore;
