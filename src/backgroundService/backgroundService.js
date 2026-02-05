import BackgroundFetch from 'react-native-background-fetch';
import useDbStore from '../database/dbStore';
import {getSetting} from '../database/settings';
// import { performBackupTask} from '../backupAdv/backupManager';
import useSettingsStore from '../Settings/settingsStore';
import { performBackupTask } from '../backupAdv/backupNew';

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
    await this.scheduleBackendNotificationPolling();
  }

  static toggleBackupTask(settings = {}) {
    this.scheduleBackupTask(settings);
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

  static async runBackgroundTask(taskId) {
    if (taskId === 'com.audiotracker.notify') {

      // await handleBackgroundNotifications();
      console.log('i am running');
    }
    if (taskId === 'com.audiotracker.backup') {
      // console.log(
      //   `[BackgroundTask] Executing backup with taskId ${taskId}`,
      // );
      await performBackupTask();
        console.log('i backup am running');
    }
  }


  // 🔍 Status checker
  static async getBackgroundServiceStatus() {
    const status = await BackgroundFetch.status();
    const isTaskScheduled = await getSetting('BACKUP_TASK_SCHEDULED');

    let statusString = '';
    switch (status) {
      case BackgroundFetch.STATUS_RESTRICTED:
        statusString = 'restricted';
        break;
      case BackgroundFetch.STATUS_DENIED:
        statusString = 'denied';
        break;
      case BackgroundFetch.STATUS_AVAILABLE:
        statusString = isTaskScheduled
          ? 'configured and task scheduled'
          : 'configured but no task scheduled';
        break;
      default:
        statusString = 'unknown';
    }

    console.log(`[BackgroundService] Current status: ${statusString}`);
    return statusString;
  }

  // In AndroidBackgroundService.js
  static async ensureAndSyncBackupBGService(sessionType, settings) {
    // Restart backup schedule if signing in or if backup is enabled but task is not scheduled

    // restarts the backup if before signOut backup was enabled. .
    //we only want this on SignIn to resuming backup schedule or if backuo_enabled and task not scheduled
    //running everytime on restore , will reset the schedule.
    const bgTaskStatusString = await this.getBackgroundServiceStatus();
    console.log('background backup status:', bgTaskStatusString);

    const isBackupEnabled = settings.BACKUP_ENABLED;
    const isTaskProperlyScheduled =
      isBackupEnabled && bgTaskStatusString === 'configured and task scheduled';

    const shouldInitBackgroundService =
      sessionType === 'signIn' || !isTaskProperlyScheduled;

    if (shouldInitBackgroundService) {
      this.toggleBackupTask({BACKUP_ENABLED: isBackupEnabled});
    }
  }
}

export default AndroidBackgroundService;
