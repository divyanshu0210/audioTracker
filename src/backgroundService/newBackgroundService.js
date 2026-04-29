import BackgroundService from 'react-native-background-actions';
import {PermissionsAndroid, Platform} from 'react-native';
import {attemptRestore} from '../backupRestore/restoreManager';

const options = {
  taskName: 'Restore Data',
  taskTitle: 'Restoring your data',
  taskDesc: 'Restoring data from Drive backup',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#00ff00',
};

// The background task - receives the restore function as parameter
const restoreTask = async taskData => {
  try {
    console.log('[SERVICE] Running restore in background');

    const {userId, backups} = taskData;

    // Execute the restore function directly
    await attemptRestore(userId, backups);

    console.log('[SERVICE] Restore completed successfully');
  } catch (e) {
    console.error('[SERVICE] Restore error:', e);
  } finally {
    // Stop the background service when done
    await BackgroundService.stop();
  }
};

export const runRestoreInBackground = async (userId, backups) => {
  if (BackgroundService.isRunning()) {
    console.log('[SERVICE] Service already running, stopping first');
    await BackgroundService.stop();
  }

  console.log('[SERVICE] Starting restore background service');

  await BackgroundService.start(restoreTask, {
    ...options,
    parameters: {
      userId,
      backups
    },
  });
};

export const requestPermissions = async () => {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
};
