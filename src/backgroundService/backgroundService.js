import BackgroundFetch from 'react-native-background-fetch';
import useDbStore from '../database/dbStore';
import {getSetting} from '../database/settings';
import useSettingsStore from '../Settings/settingsStore';
import {performBackupTask} from '../backupAdv/backupNew';

class AndroidBackgroundService {
  static userId = null;
  static backgroundTaskScheduled = false;

  static async init(forceStop = false) {
    this.userId = useDbStore.getState().currentUserId;
    if (forceStop) {
      console.log(`[BackgroundService] Stopping all backup task`);
      await this.stopBackupTask(); //stop backup task
      await BackgroundFetch.stop(); // stops all other periodic default task
      console.log(`[BackgroundService] All backup task stopped`);
      return;
    }
    await this.configureSystem();
    // await this.scheduleBackendNotificationPolling();
  }

  static async configureSystem() {
    try {
      await BackgroundFetch.configure(
        {
          // minimumFetchInterval: 15,
          stopOnTerminate: false,
          startOnBoot: true,
          forceAlarmManager: true,
          enableHeadless: true,
        },
        async taskId => {
          await this.runBackgroundTask(taskId);
          BackgroundFetch.finish(taskId);
        },
        taskId => {
          console.warn(
            '[BackgroundTask] OS is about to terminate task:',
            taskId,
          );
          BackgroundFetch.finish(taskId);
        },
        error => {
          console.error('[BackgroundService] Config error:', error);
        },
      );
      console.log('[BackgroundService] BackgroundFetch configured');
    } catch (error) {
      console.error('[BackgroundService] Failed to configure:', error);
    }
  }

  static async runBackgroundTask(taskId) {
    if (taskId === 'com.audiotracker.notify') {
      // await handleBackgroundNotifications();
      console.log('i am running');
    }
    if (taskId === 'com.audiotracker.backup') {
      await performBackupTask();
    }
  }

  static async scheduleBackendNotificationPolling() {
    try {
      const delay = 1 * 60 * 1000;
      const success = await BackgroundFetch.scheduleTask({
        taskId: 'com.audiotracker.notify',
        delay: delay,
        periodic: true,
        allowWhileIdle: true,
        stopOnTerminate: false,
        startOnBoot: true,
        forceAlarmManager: true,
        enableHeadless: true,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
      });
      console.log('[BackgroundTask] Polling scheduled:', success);
    } catch (error) {
      console.error('[BackgroundTask] Polling error:', error);
    }
  }

  static async scheduleBackupTask(settings) {
    const isBackupEnabled = settings?.BACKUP_ENABLED;
    console.log(isBackupEnabled);
    if (!isBackupEnabled) {
      await this.stopBackupTask();
      return;
    }

    try {
      const delay = 1 * 1 * 60 * 1000;
      const success = await BackgroundFetch.scheduleTask({
        taskId: 'com.audiotracker.backup',
        delay,
        periodic: true,
        allowWhileIdle: true,
        stopOnTerminate: false,
        startOnBoot: true,
        forceAlarmManager: true,
        enableHeadless: true,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
      });

      console.log('[BackgroundTask] Backup scheduled:', success);

      await useSettingsStore
        .getState()
        .updateSettings({BACKUP_TASK_SCHEDULED: true});
    } catch (error) {
      console.error('[BackgroundTask] Backup scheduling error:', error);
      await useSettingsStore
        .getState()
        .updateSettings({BACKUP_TASK_SCHEDULED: false});
    }
  }

  static async stopBackupTask() {
    BackgroundFetch.stop('com.audiotracker.backup');
    // this.backgroundTaskScheduled = false;
    await useSettingsStore
      .getState()
      .updateSettings({BACKUP_TASK_SCHEDULED: false});
    console.log(
      `[BackgroundService] Backup disabled for userId ${this.userId}- stopping background tasks`,
    );
  }

  static toggleBackupTask(settings = {}) {
    this.scheduleBackupTask(settings);
  }

  // In AndroidBackgroundService.js
  static async ensureAndSyncBackupBGService(settings) {
    const isBackupEnabled = settings?.BACKUP_ENABLED;
    this.toggleBackupTask({BACKUP_ENABLED: isBackupEnabled});
  }
}

export default AndroidBackgroundService;
