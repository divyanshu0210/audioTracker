// stores/useLoadingStore.js
import {create} from 'zustand';

const useLoadingStore = create((set, get) => ({
  loading: false,
  setLoading: isLoading => set({loading: isLoading}),
  // Loading states map
  loadingStates: {
    youtube: false,
    device: false,
    drive: false,
    notebooks: false,
    itemNotes: false,
    mainNotes: false,
    mainMoreNotes: false,
  },

  // Set individual loading state
  setLoadingState: (key, isLoading) =>
    set(state => ({
      loadingStates: {
        ...state.loadingStates,
        [key]: isLoading,
      },
    })),

  // Get individual loading state
  getLoadingState: key => get().loadingStates[key],

  // Set all loading states at once
  setAllLoadingStates: isLoading =>
    set(state => ({
      loadingStates: {
        ...state.loadingStates, // ← spread existing first
        youtube: isLoading,
        device: isLoading,
        drive: isLoading,
        notebooks: isLoading,
        // mainNotes, itemNotes, mainMoreNotes are preserved
      },
    })),

  // Check if any loading is happening
  isAnyLoading: () => {
    const {loadingStates} = get();
    return Object.values(loadingStates).some(isLoading => isLoading === true);
  },

  // Check if all loading are complete
  isAllLoadingComplete: () => {
    const {loadingStates} = get();
    return Object.values(loadingStates).every(isLoading => isLoading === false);
  },
}));

export default useLoadingStore;
