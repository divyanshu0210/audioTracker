import BackgroundService from 'react-native-background-actions';
import { syncBackupsToDrive } from '../backupAdv/backupNew';
import { DeviceEventEmitter, PermissionsAndroid } from 'react-native';

const oneTimeTask = async () => {
  try {
    console.log('[SERVICE] Running one-time backup sync');

    await syncBackupsToDrive();

    console.log('[SERVICE] Task finished');
  } catch (e) {
    console.error('[SERVICE] Error:', e);
  } finally {
    // 🔴 VERY IMPORTANT: stop service manually
    DeviceEventEmitter.emit('backupAllCompleted');
    await BackgroundService.stop();
  }
};

const options = {
  taskName: 'Backup Sync',
  taskTitle: 'Syncing backups',
  taskDesc: 'Uploading your data to Drive',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#00ff00',
};

export const runBackupDriveSync = async (source) => {
  if (BackgroundService.isRunning()) {
    console.log('[SERVICE] Already running, skipping');
    return;
  }
  
  console.log('[SERVICE] Backup Sync Started By',source);
  await BackgroundService.start(oneTimeTask, options);
};

export const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };