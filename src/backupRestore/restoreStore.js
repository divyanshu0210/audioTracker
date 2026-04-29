import {create} from 'zustand';
import {Alert} from 'react-native';
import {savePendingBackups, listAllDriveBackups, attemptRestore} from './restoreManager';

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

  // Core restore logic with navigation
  performRestoreAndNavigate: async (userInfo, navigateToMain) => {
    const { updateProgress, setRestoreError} = get();

    try {
      const backups = await listAllDriveBackups();

      if (!backups || backups.length === 0) {
        // No backup found, just navigate
        await navigateToMain(userInfo);
        return false;
      }

      await savePendingBackups(userInfo.user.id, backups);

        await attemptRestore(userInfo.user.id, backups, pct => {
          updateProgress(pct);
        });

      updateProgress(100);

      // Wait a moment to show 100%
      await new Promise(r => setTimeout(r, 500));
      await navigateToMain(userInfo);

      return true;
    } catch (error) {
      console.error('[RestoreStore] Restore failed:', error);
      setRestoreError(error.message);

      Alert.alert(
        'Restore In Progress',
        'Your data is being restored in the background. You can close the app and it will continue.',
        [{text: 'OK'}],
      );

      return false;
    }
  },
}));

export default useRestoreStore;
