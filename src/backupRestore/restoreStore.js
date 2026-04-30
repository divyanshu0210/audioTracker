import {create} from 'zustand';

const useRestoreStore = create((set, get) => ({
  // State
  isRestoring: false,
  restorePercent: 0,
  restoreError: null,
  animProgress: 0,

  // Actions
  startRestore: () => {
    set({isRestoring: true, restoreError: null, restorePercent: 0});
  },

  updateProgress: percent => {
    set({restorePercent: Math.min(percent, 100)});
  },

  setRestoreError: error => {
    set({restoreError: error, isRestoring: false});
  },

  resetRestore: () => {
    set({isRestoring: false, restorePercent: 0, restoreError: null});
  },

  setOnComplete: fn => set({_onComplete: fn}),

  // background service calls this when done
  notifyComplete: () => {
    const {_onComplete} = get();
    if (_onComplete) {
      set({restorePercent: 100, isRestoring: false});
      _onComplete(); // navigateToMain
    }
  },
}));

export default useRestoreStore;
