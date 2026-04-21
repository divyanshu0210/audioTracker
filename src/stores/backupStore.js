import {create} from 'zustand';
import {Alert, NativeModules} from 'react-native';
import useSettingsStore from '../Settings/settingsStore';
import {setBackupSyncNetworkListener} from '../backupAdv/backupNew';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {runBackupDriveSync} from '../backgroundService/newBackgroundService';

const {BackupModule} = NativeModules;

const MAX_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const getBackupTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1);

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${hours}${minutes}`;
};

const useBackupStore = create((set, get) => ({
  loading: false,
  lastBackupTime: 'Never',
  setLastBackupTime: val => set({lastBackupTime: val}),
  /* ---------------------------------- */
  /* Load last backup time               */
  /* ---------------------------------- */

  refreshLastBackupTime: async () => {
    try {
      // the formt must be 2 min ago, tll 2 hr ago and then date and time
      const datasynctime =
        useSettingsStore.getState().settings.LAST_BACKUP_SYNC_LOCAL_TIME;

      if (datasynctime) {
        set({
          lastBackupTime: datasynctime || 'Never',
        });
      } else {
        set({lastBackupTime: 'Never'});
      }
    } catch (e) {
      console.log('Backup time load error', e);
      set({lastBackupTime: 'Never'});
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

  enableBackup: async () => {
    if (get().loading) return;

    set({loading: true});

    try {
      await BackupModule.scheduleBackupAtTime(getBackupTime(), 5);

      const scheduled = await get().verifyScheduled();

      if (!scheduled) throw new Error('Worker not scheduled');

      const updated = {
        BACKUP_ENABLED: true,
        LAST_BACKUP_SYNC_TIME: '2000-01-01T00:00:00',
        LAST_BACKUP_SYNC_LOCAL_TIME: '2000-01-01 00:00:00',
      };

      useSettingsStore.getState().updateSettings(updated);

      const userId = await AsyncStorage.getItem('userId');

      await BackupModule.setPreference(
        `LAST_NATIVE_BACKUP_TIME_${userId}`,
        updated.LAST_BACKUP_SYNC_TIME,
      );

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

  runManualBackup: async () => {
    try {
      await BackupModule.runBackupNow();
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

      await runBackupDriveSync('App Startup');

      // although sybc fn also updates the time after successful sync,
      // this ensures we have the latest time on app start
      await get().refreshLastBackupTime();

      await setBackupSyncNetworkListener();

      // TO DO: Add fn to check if a native backup was missed and has to be run manually if needed

      console.log('[Backup] Initialization complete');
    } catch (e) {
      console.log('[Backup] Initialization failed', e);
    }
  },
}));

export default useBackupStore;
