import BackgroundService from 'react-native-background-actions';
import {PermissionsAndroid, Platform} from 'react-native';
import {attemptRestore, loadPendingBackups, loadRestoreProgress, saveRestoreProgress} from '../backupRestore/restoreManager';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
};

/**
 * Background task that continues restore even when app is in background/killed.
 * Progress is continuously saved to AsyncStorage.
 */
const restoreTask = async (taskData) => {
  const { userId } = taskData;
  
  try {
    const backups = await loadPendingBackups(userId);
    if (!backups) {
      console.error('[BACKGROUND] No backup list found');
      return;
    }

    // Load saved progress to update notification
    const updateNotification = async () => {
      const progress = await loadRestoreProgress(userId);
      if (progress?.totalBytes > 0) {
        const percent = Math.min(Math.round((progress.downloadedBytes / progress.totalBytes) * 100), 100);
        
        // Update notification with current progress
        await BackgroundService.updateNotification({
          taskDesc: `Restoring... ${percent}% complete`,
          progressBar: {
            max: 100,
            value: percent,
            indeterminate: false,
          },
        });
      }
    };

    // Set up progress callback that updates notification
    const onProgress = async (percent) => {
      await BackgroundService.updateNotification({
        taskDesc: `Restoring... ${percent}% complete`,
        progressBar: {
          max: 100,
          value: percent,
          indeterminate: false,
        },
      });
    };

    await attemptRestore(userId, backups, onProgress);
    console.log('[BACKGROUND] Restore completed');
    
    // Show completion notification
    await BackgroundService.updateNotification({
      taskDesc: 'Restore complete!',
      progressBar: {
        max: 100,
        value: 100,
        indeterminate: false,
      },
    });
    
    // Store completion flag
    await AsyncStorage.setItem(`restore_completed_${userId}`, 'true');
    
  } catch (e) {
    console.error('[BACKGROUND] Restore error:', e);
    await BackgroundService.updateNotification({
      taskDesc: 'Restore paused - will resume when you reopen',
    });
  } finally {
    // Don't stop the service - let it complete naturally
    // BackgroundService.stop() will be called when task finishes
  }
};

/**
 * Start background restore with continuous progress
 */
export const startBackgroundRestore = async (userId) => {
  if (BackgroundService.isRunning()) {
    console.log('[BACKGROUND] Service already running');
    return;
  }

  // Request notification permission for Android 13+
  await requestPermissions();

  await BackgroundService.start(restoreTask, {
    ...options,
    parameters: { userId },
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

/**
 * Request necessary permissions
 */
export const requestPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      const permissionsToRequest = [];
      
      // Notification permission for Android 13+ (API 33+)
      if (Platform.Version >= 33) {
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      
      // Note: FOREGROUND_SERVICE_DATA_SYNC requires:
      // - React Native 0.73+ 
      // - Android 14 (API 34) with proper manifest declaration
      // Let's make it optional and check if it exists first
      if (Platform.Version >= 34 && PermissionsAndroid.PERMISSIONS.FOREGROUND_SERVICE_DATA_SYNC) {
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.FOREGROUND_SERVICE_DATA_SYNC);
      }
      
      if (permissionsToRequest.length > 0) {
        const granted = await PermissionsAndroid.requestMultiple(permissionsToRequest);
        
        // Check if at least notification permission is granted (for Android 13+)
        if (Platform.Version >= 33) {
          return granted[PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS] === PermissionsAndroid.RESULTS.GRANTED;
        }
      }
    } catch (err) {
      console.warn('[BACKGROUND] Permission error:', err);
    }
  }
  return true;
};