import {create} from 'zustand';
import {Alert, NativeModules} from 'react-native';
import useSettingsStore from '../Settings/settingsStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const {BackupModule} = NativeModules;

const getBackupTime = () => {
  // const now = new Date();
  // now.setHours(now.getHours() - 1);

  // const hours = String(now.getHours()).padStart(2, '0');
  // const minutes = String(now.getMinutes()).padStart(2, '0');

  // return `${hours}${minutes}`;

  return '0400'; // 4 AM daily backup time
};

const useBackupStore = create((set, get) => ({
  loading: false,
  lastBackupTime: 'Never',
  lastBackupSyncTime: 'Never',
  backupRunning: false,
  syncRunning: false,
  setLastBackupTime: val => set({lastBackupTime: val}),
  setLastBackupSyncTime: val => set({lastBackupSyncTime: val}),
  /* ---------------------------------- */
  /* Load last backup time               */
  /* ---------------------------------- */

refreshLastBackupTime: async () => {
  try {
    const userId = await AsyncStorage.getItem('userId');
    if (!userId) {
      set({ lastBackupSyncTime: 'Never' });
      return;
    }
    const lastSync = await BackupModule.getPreference(
      'LAST_BACKUP_SYNC_TIME_' + userId
    );
    if (!lastSync || lastSync.startsWith('2000-01-01')) {
      set({ lastBackupSyncTime: 'Never' });
      return;
    }
    // ✅ format to human readable
    // const formatted = get().formatRelativeTime(lastSync);
    set({ lastBackupSyncTime: lastSync });
  } catch (e) {
    console.log('Backup time load error', e);
    set({ lastBackupSyncTime: 'Never' });
  }
},

  /* ---------------------------------- */
  /* Verify worker scheduled             */
  /* ---------------------------------- */

  verifyScheduled: async () => {
    const status = await BackupModule.getBackupStatus();
    return status?.state === 'ENQUEUED';
  },

  /* ---------------------------------- */
  /* Enable automatic backup             */
  /* ---------------------------------- */
  setNativePreference: async (key, value) => {
    try {
      await BackupModule.setPreference(key, value);
    } catch (e) {
      console.log('Set preference error:', e);
    }
  },

  enableBackup: async () => {
    if (get().loading) return;

    set({loading: true});

    try {
      await BackupModule.scheduleBackupAtTime(getBackupTime(), 5);

      const scheduled = await get().verifyScheduled();

      if (!scheduled) throw new Error('Worker not scheduled');

      const updated = {
        BACKUP_ENABLED: true,
        LAST_BACKUP_SYNC_TIME: '2000-01-01 00:00:00',
        LAST_BACKUP_SYNC_LOCAL_TIME: '2000-01-01 00:00:00',
      };

      useSettingsStore.getState().updateSettings(updated);

      const userId = await AsyncStorage.getItem('userId');

      await get().setNativePreference(
        `LAST_NATIVE_BACKUP_TIME_${userId}`,
        updated.LAST_BACKUP_SYNC_TIME,
      );

      await get().setNativePreference(
        `LAST_BACKUP_SYNC_TIME_${userId}`,
        updated.LAST_BACKUP_SYNC_TIME,
      );

      await get().setNativePreference('BACKUP_ENABLED', 'true');

      await get().refreshLastBackupTime();
    } catch (e) {
      console.log('Enable backup failed:', e);

      Alert.alert('Backup Error', 'Failed to enable automatic backup.');
    } finally {
      set({loading: false});
    }
  },

  /* ---------------------------------- */
  /* Disable automatic backup            */
  /* ---------------------------------- */

  disableBackup: async (updateSetting = true) => {
    if (get().loading) return;

    set({loading: true});

    try {
      await BackupModule.cancelBackup();

      const scheduled = await get().verifyScheduled();

      if (scheduled) throw new Error('Worker still active');

      if (updateSetting) {
        useSettingsStore.getState().updateSettings({
          BACKUP_ENABLED: false,
        });
        await get().setNativePreference('BACKUP_ENABLED', 'false');
      }
    } catch (e) {
      console.log('Disable backup failed:', e);

      Alert.alert('Backup Error', 'Failed to disable automatic backup.');
    } finally {
      set({loading: false});
    }
  },

  /* ---------------------------------- */
  /* Toggle backup                       */
  /* ---------------------------------- */

  toggleBackup: async enabled => {
    if (enabled) {
      await get().enableBackup();
    } else {
      await get().disableBackup();
    }
  },

  /* ---------------------------------- */
  /* Run manual backup                   */
  /* ---------------------------------- */

  runManualBackup: async (waitForCompletion = false) => {
    try {
      await BackupModule.runBackupNow();
      if (waitForCompletion) {
        // await waitForFullBackup();
      }
    } catch (e) {
      Alert.alert('Backup Error', 'Failed to start backup.');
    }
  },

  /* ---------------------------------- */
  /* Check backup status                 */
  /* ---------------------------------- */

  checkBackupStatus: async () => {
    try {
      const status = await BackupModule.getBackupStatus();

      if (status.state === 'ENQUEUED') {
        Alert.alert(
          'Backup Scheduled',
          `Next backup:\n${new Date(status.nextRunTime).toLocaleString()}`,
        );
      } else {
        Alert.alert(
          'Backup Not Scheduled',
          'Automatic backup is currently disabled.',
        );
      }

      return status;
    } catch (e) {
      Alert.alert('Error', 'Could not fetch backup status');
    }
  },

  /* ---------------------------------- */
  /* Worker self-healing                 */
  /* ---------------------------------- */

  healWorkerIfNeeded: async () => {
    try {
      const status = await BackupModule.getBackupStatus();

      const settings = useSettingsStore.getState().settings;

      if (settings.BACKUP_ENABLED && status?.state !== 'ENQUEUED') {
        console.log('[Backup] Worker missing → rescheduling');

        await BackupModule.scheduleBackupAtTime(getBackupTime(), 5);
        await get().setNativePreference('BACKUP_ENABLED', 'true');
      }
    } catch (e) {
      console.log('Worker heal error:', e);
    }
  },

  appStartupBackupRoutine: async () => {
    try {
      console.log('[Backup] Initializing backup system');

      await get().healWorkerIfNeeded();

      //run on startup to make sure that we have drive folder created once ]
      // on startup and not with every backup sync
      // await initializeDriveFolders();

      // await runBackupDriveSync('App Startup');

      // although sybc fn also updates the time after successful sync,
      // this ensures we have the latest time on app start
      await get().refreshLastBackupTime();

      // await setBackupSyncNetworkListener();

      // TO DO: Add fn to check if a native backup was missed and has to be run manually if needed

      console.log('[Backup] Initialization complete');
    } catch (e) {
      console.log('[Backup] Initialization failed', e);
    }
  },

  initializeEventListeners: () => {
    const {DeviceEventEmitter} = require('react-native');

    const sub1 = DeviceEventEmitter.addListener('backupStarted', () => {
      set({backupRunning: true});
    });

    const sub2 = DeviceEventEmitter.addListener('backupCompleted', () => {
      set({backupRunning: false});
    });

    const sub3 = DeviceEventEmitter.addListener('driveSyncStarted', () => {
      set({syncRunning: true});
    });

    const sub4 = DeviceEventEmitter.addListener('driveSyncCompleted', () => {
      set({syncRunning: false});
      get().refreshLastBackupTime();
    });

    // store subscriptions so we can clean later if needed
    set({
      _subscriptions: [sub1, sub2, sub3, sub4],
    });
  },

  cleanupEventListeners: () => {
    const subs = get()._subscriptions || [];
    subs.forEach(s => s.remove());
    set({_subscriptions: []});
  },

  formatRelativeTime: (timestamp) => {
  try {
    const date = new Date(timestamp.replace(' ', 'T'));
    const now = new Date();

    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / (1000 * 60));

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} min ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;

    return date.toLocaleString();
  } catch {
    return 'Invalid time';
  }
},
}));

export default useBackupStore;
