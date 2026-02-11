import BackgroundService from 'react-native-background-actions';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { performBackupTask } from '../backupAdv/backupNew';
import { getSetting } from '../database/settings';

/* ---------------------------------- */
/* Constants                           */
/* ---------------------------------- */

const BACKUP_INTERVAL_MS = 5 * 60 * 1000; 

/* ---------------------------------- */
/* Internal State                      */
/* ---------------------------------- */

let autoBackupEnabled = true;
let isBackupRunning = false;
let backupInterval = null;
let appStateSubscription = null;

/* ---------------------------------- */
/* Auto-backup setting                 */
/* ---------------------------------- */

export async function loadAutoBackupSetting() {
  const value = await getSetting('BACKUP_ENABLED') ??  true;
  autoBackupEnabled = value ; // default ON
  return autoBackupEnabled;
}

export async function toggleAutoBackupEnabled(enabled) {
  autoBackupEnabled = enabled;
  if (enabled) {
    registerBackupAppStateListener();
    startForegroundBackupInterval();
  } else {
    stopForegroundBackupInterval();
    unregisterBackupAppStateListener();
  }
}

export function isAutoBackupEnabled() {
  return autoBackupEnabled;
}

/* ---------------------------------- */
/* Backup runner (one-shot service)    */
/* ---------------------------------- */

async function runBackupWithService(reason) {
  if (!autoBackupEnabled) {
    console.log('[Backup] Skipped (auto-backup OFF)');
    return;
  }

  if (isBackupRunning) return;

  isBackupRunning = true;
  console.log(`[Backup] Triggered (${reason})`);

  const task = async () => {
    try {
      await performBackupTask();
    } catch (e) {
      console.log('[BackupTask] Failed:', e);
    } finally {
      isBackupRunning = false;
      await BackgroundService.stop();
      console.log('[Backup] Finished');
    }
  };

  try {
    await BackgroundService.start(task, {
      taskName: 'Backup',
      taskTitle: 'Data Backup',
      taskDesc: 'Syncing data to Google Drive...',
      taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    });
  } catch (e) {
    isBackupRunning = false;
    console.log('[Backup] Error starting service', e);
  }
}


/* ---------------------------------- */
/* Foreground interval                 */
/* ---------------------------------- */

export function startForegroundBackupInterval() {
  if (!autoBackupEnabled || backupInterval) return;

  backupInterval = setInterval(() => {
    runBackupWithService('foreground-interval');
  }, BACKUP_INTERVAL_MS);
}

export function stopForegroundBackupInterval() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}

/* ---------------------------------- */
/* AppState listener                   */
/* ---------------------------------- */

export function registerBackupAppStateListener() {
  if (!autoBackupEnabled || appStateSubscription) return;

  let state = AppState.currentState;

  appStateSubscription = AppState.addEventListener('change', (next) => {
    if (!autoBackupEnabled) return;
    // App opened
    if (state.match(/inactive|background/) && next === 'active') {
      runBackupWithService('app-open');
      startForegroundBackupInterval();
    }
    // App closing
    if (state === 'active' && next.match(/inactive|background/)) {
      runBackupWithService('app-close');
      stopForegroundBackupInterval();
    }
    state = next;
  });
}

export function unregisterBackupAppStateListener() {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

/* ---------------------------------- */
/* App startup / cleanup helpers       */
/* ---------------------------------- */

export async function initAutoBackupSystem() {
  const enabled = await loadAutoBackupSetting();
  if (enabled) {
    registerBackupAppStateListener();
    startForegroundBackupInterval();
  }
}

export function shutdownAutoBackupSystem() {
  stopForegroundBackupInterval();
  unregisterBackupAppStateListener();
}
