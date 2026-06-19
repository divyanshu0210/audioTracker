import BackgroundService from 'react-native-background-actions';
import {PermissionsAndroid, Platform} from 'react-native';
import {attemptRestore} from '../backupRestore/restoreManager';
import useRestoreStore from '../backupRestore/restoreStore';

const options = {
  taskName: 'Restore Data',
  taskTitle: 'Restoring your data',
  taskDesc: 'Restoring data from Drive backup',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#4fc3f7',
  progressBar: {
    max: 100,
    value: 0,
    indeterminate: false,
  },
  // ACTION_VIEW deep link that only this app registers (manifest: scheme
  // "audiotracker") → opens the app directly, no app-chooser dialog.
  // LinkHandler ignores any audiotracker:// URL, so no navigation/rerenders.
  linkingURI: 'audiotracker://open',
};

/**
 * Background task that continues restore even when app is in background/killed.
 * Progress is continuously saved to AsyncStorage.
 */
const restoreTask = async taskData => {
  const {userInfo, backups} = taskData;
  const {updateProgress, notifyComplete} = useRestoreStore.getState();

  try {
    await attemptRestore(userInfo, backups, async percent => {
      updateProgress(percent); // ← directly updates UI
      await safeUpdateNotification({
        taskDesc: `Restoring... ${percent}% complete`,
        progressBar: {max: 100, value: percent, indeterminate: false},
      });
    });

    await new Promise(r => setTimeout(r, 500));
    notifyComplete();

    updateProgress(100);
    await safeUpdateNotification({
      taskDesc: 'Restore complete!',
      progressBar: {max: 100, value: 100, indeterminate: false},
    });
  } catch (e) {
    console.error('[BACKGROUND] Restore error:', e);
    await safeUpdateNotification({
      taskDesc: 'Restore paused - will resume when you reopen',
    });
    throw e; 
  }
};

/**
 * Start background restore with continuous progress
 */
export const startBackgroundRestore = async (userInfo, backups) => {
  if (BackgroundService.isRunning()) {
    console.log('[BACKGROUND] Service already running');
    return;
  }
  // Request notification permission for Android 13+

 await requestPermissions().catch(() => {
    console.log('[BACKGROUND] Notification permission denied — continuing anyway');
  });

  await BackgroundService.start(restoreTask, {
    ...options,
    parameters: {userInfo, backups},
  });
};

/**
 * Stop background restore (if user cancels)
 */
export const stopBackgroundRestore = async () => {
  if (BackgroundService.isRunning()) {
    await BackgroundService.stop();
  }
};

/**
 * Check if background restore is active
 */
export const isBackgroundRestoreRunning = async () => {
  return BackgroundService.isRunning();
};

const safeUpdateNotification = async (opts) => {
  try {
    await BackgroundService.updateNotification(opts);
  } catch (e) {
    console.log('[BACKGROUND] Notification update failed — ignoring:', e);
  }
};

/**
 * Request necessary permissions
 */
export const requestPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      const permissionsToRequest = [];

      // Notification permission for Android 13+ (API 33+)
      if (Platform.Version >= 33) {
        permissionsToRequest.push(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      }

      // Note: FOREGROUND_SERVICE_DATA_SYNC requires:
      // - React Native 0.73+
      // - Android 14 (API 34) with proper manifest declaration
      // Let's make it optional and check if it exists first
      if (
        Platform.Version >= 34 &&
        PermissionsAndroid.PERMISSIONS.FOREGROUND_SERVICE_DATA_SYNC
      ) {
        permissionsToRequest.push(
          PermissionsAndroid.PERMISSIONS.FOREGROUND_SERVICE_DATA_SYNC,
        );
      }

      if (permissionsToRequest.length > 0) {
        const granted =
          await PermissionsAndroid.requestMultiple(permissionsToRequest);

        // Check if at least notification permission is granted (for Android 13+)
        if (Platform.Version >= 33) {
          return (
            granted[PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS] ===
            PermissionsAndroid.RESULTS.GRANTED
          );
        }
      }
    } catch (err) {
      console.warn('[BACKGROUND] Permission error:', err);
    }
  }
  return true;
};
