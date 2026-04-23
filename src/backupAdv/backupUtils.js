import useSettingsStore from '../Settings/settingsStore';

export const saveBackupSyncTimestamp = async () => {
  try {
    
    const nowUTC = new Date().toISOString()
    // .slice(0, 19).replace('T', ' '); // "YYYY-MM-DD HH:MM:SS"
    const nowLocal = new Date().toLocaleString();

    const timestampData = {
      LAST_BACKUP_SYNC_TIME: nowUTC,
      LAST_BACKUP_SYNC_LOCAL_TIME: nowLocal,
    };

    // --------------------------
    await useSettingsStore.getState().updateSettings(timestampData);

    console.log(`🔒 Backup timestamp saved`, timestampData);
  } catch (error) {
    console.error('Failed to save backup timestamp:', error);
  }
};


export const waitForFullBackup = () => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sub.remove();
      reject(new Error('Backup timeout'));
    }, 30000);

    const sub = backupEmitter.addListener('backupAllCompleted', () => {
      clearTimeout(timeout);
      sub.remove();
      resolve(true);
    });
  });
};