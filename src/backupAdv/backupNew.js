// backup.js - Hierarchical backup strategy for React Native with calendar-based timing
// Features:
// - Daily incremental backups, weekly/monthly/yearly differential backups.
// - Clears all lower-level queues when a higher-level backup is created (locally and on Drive).
// - Creates local folders (daily, weekly, monthly, yearly) and Google Drive folders (daily, weekly, monthly, yearly, images).
// - Queues non-image backups locally in mirrored folder structure during offline, syncs on reconnect.
// - Images are incrementally backed up only on reconnect, no local storage.
// - Modularized to remove redundancy.
// - Assumes SQLite database with created_at/updated_at columns; deletions need separate handling.

import RNFetchBlob from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import NetInfo from '@react-native-community/netinfo';
import {AppState} from 'react-native';
import BackgroundFetch from 'react-native-background-fetch';
import {
  getUserDatabase,
  initUserDatabase,
} from '../database/UserDatabaseInstance';
import {getDb} from '../database/database';
import useDbStore from '../database/dbStore';
import {
  getLastBackupTimestamp,
  prepareIncrementalBackup,
  saveBackupTimestamp,
} from './backupUtils';
import {verifyGoogleDriveUpload} from './googleDriveBackupUtils';

// Constants
const BACKUP_FOLDER = `${RNFetchBlob.fs.dirs.DocumentDir}/backups`;
const DRIVE_MAIN_FOLDER_NAME = 'AppBackups';
const DRIVE_FOLDERS = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly',
  images: 'images',
};
export const LOCAL_BACKUP_FOLDERS = {
  daily: `${BACKUP_FOLDER}/daily`,
  weekly: `${BACKUP_FOLDER}/weekly`,
  monthly: `${BACKUP_FOLDER}/monthly`,
  yearly: `${BACKUP_FOLDER}/yearly`,
  images: `${BACKUP_FOLDER}/images`, // Defined for consistency, not used
};

// Helper: Get or create Google Drive folder
async function getOrCreateDriveFolder(folderName, parentId = 'root') {
  try {
    const {accessToken} = await GoogleSignin.getTokens();
    const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`;
    const response = await RNFetchBlob.fetch(
      'GET',
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
      {Authorization: `Bearer ${accessToken}`},
    );
    const {files} = response.json();
    if (files && files.length > 0) {
      console.log(`Folder '${folderName}' found: ${files[0].id}`);
      return files[0].id;
    }

    const createResponse = await RNFetchBlob.fetch(
      'POST',
      'https://www.googleapis.com/drive/v3/files',
      {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    );
    const newFolder = createResponse.json();
    console.log(`Created folder '${folderName}': ${newFolder.id}`);
    return newFolder.id;
  } catch (error) {
    console.error(`Error getting/creating folder '${folderName}':`, error);
    throw error;
  }
}

// Initialize Drive folders
async function initializeDriveFolders() {
  const mainFolderId = await getOrCreateDriveFolder(DRIVE_MAIN_FOLDER_NAME);
  const folderIds = {};
  for (const [key, name] of Object.entries(DRIVE_FOLDERS)) {
    folderIds[key] = await getOrCreateDriveFolder(name, mainFolderId);
  }
  await AsyncStorage.setItem('driveFolderIds', JSON.stringify(folderIds));
  console.log('Drive folders initialized:', folderIds);
  return folderIds;
}

// Initialize local folders (exclude images)
async function initializeLocalFolders() {
  for (const [key, path] of Object.entries(LOCAL_BACKUP_FOLDERS)) {
    if (!(await RNFetchBlob.fs.exists(path))) {
      await RNFetchBlob.fs.mkdir(path);
      console.log(`Created local folder: ${path}`);
    } else {
      console.log(`Local folder already exists: ${path}`);
    }
  }
}

// Get Drive folder ID
async function getDriveFolderId(type) {
  const stored = await AsyncStorage.getItem('driveFolderIds');
  if (!stored) {
    const folderIds = await initializeDriveFolders();
    return folderIds[type];
  }
  const folderIds = JSON.parse(stored);
  return folderIds[type];
}

// Calendar-based helpers
function isEndOfWeek(date = new Date()) {
  return date.getDay() === 0; // Sunday
}

function isEndOfMonth(date = new Date()) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getDate() === 1;
}

function isEndOfYear(date = new Date()) {
  return date.getMonth() === 11 && date.getDate() === 31;
}

function getWeekStartEndDates(date = new Date()) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    start: start.toISOString().slice(0, 19).replace('T', ' '),
    end: end.toISOString().slice(0, 19).replace('T', ' '),
  };
}

function getMonthStartEndDates(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return {
    start: start.toISOString().slice(0, 19).replace('T', ' '),
    end: end.toISOString().slice(0, 19).replace('T', ' '),
  };
}

function getYearStartEndDates(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date.getFullYear(), 11, 31);
  end.setHours(23, 59, 59, 999);
  return {
    start: start.toISOString().slice(0, 19).replace('T', ' '),
    end: end.toISOString().slice(0, 19).replace('T', ' '),
  };
}

function isEmptyData(data) {
  return Object.values(data).every(
    arr => Array.isArray(arr) && arr.length === 0,
  );
}

// Export data between dates (differential backup)
export const exportDataBetweenDates = async (
  startDate,
  endDate,
  tables = null,
) => {
  try {
    const db = getUserDatabase().getDb() || getDb();
    const data = {};
    console.log(`Exporting data between ${startDate} and ${endDate}...`);

    const defaultTables = [
      'folders',
      'files',
      'playlists',
      'device_files',
      'notebooks',
      'categories',
      'videos',
      'category_items',
      'notes',
      'video_watch_history',
    ];
    const selectedTables = tables || defaultTables;

    const fetchTableData = table => {
      return new Promise(resolve => {
        db.transaction(tx => {
          let query = `SELECT * FROM ${table} WHERE (created_at BETWEEN ? AND ?) OR (updated_at BETWEEN ? AND ?)`;
          let params = [startDate, endDate, startDate, endDate];
          if (table === 'notes') {
            query = `SELECT rowid, * FROM ${table} WHERE (created_at BETWEEN ? AND ?) OR (updated_at BETWEEN ? AND ?)`;
          } else if (table === 'video_watch_history') {
            query = `SELECT * FROM ${table} WHERE date BETWEEN DATE(?) AND DATE(?)`;
            params = [startDate.split(' ')[0], endDate.split(' ')[0]];
          }
          // TODO: Add deleted_at handling if using soft deletes
          // query += ` OR (deleted_at BETWEEN ? AND ?)`;
          // params.push(startDate, endDate);

          tx.executeSql(
            query,
            params,
            (_, result) => {
              let rows;
              if (typeof result.rows.raw === 'function') {
                rows = result.rows.raw();
              } else if (result.rows._array) {
                rows = result.rows._array;
              } else {
                rows = [];
                for (let i = 0; i < result.rows.length; i++) {
                  rows.push(result.rows.item(i));
                }
              }
              console.log(`Exported ${rows.length} rows from ${table}`);
              resolve({table, rows});
            },
            (_, error) => {
              console.error(`Error exporting table ${table}:`, error);
              resolve({table, rows: []});
              return true;
            },
          );
        });
      });
    };

    const results = await Promise.all(selectedTables.map(fetchTableData));
    for (const {table, rows} of results) {
      data[table] = rows;
    }

    console.log('Data export collected:', Object.keys(data));
    return data;
  } catch (error) {
    console.error('Error in exportDataBetweenDates:', error);
    throw error;
  }
};

// Upload to Google Drive
export const uploadToGoogleDrive = async (
  filePath,
  fileName,
  mimeType = 'application/json',
  folderId = 'root',
) => {
  const {accessToken} = await GoogleSignin.getTokens();
  const response = await RNFetchBlob.fetch(
    'POST',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'multipart/related',
    },
    [
      {
        name: 'metadata',
        data: JSON.stringify({
          name: fileName,
          mimeType,
          parents: [folderId],
        }),
        type: 'application/json',
      },
      {
        name: 'file',
        filename: fileName,
        data: RNFetchBlob.wrap(filePath),
      },
    ],
  );

  if (response.info().status >= 400) {
    throw new Error(`Upload failed: ${response.data}`);
  }

  return response.json();
};

// Delete old Drive backups
export const deleteOldDriveBackups = async (backupType, keepLast = 0) => {
  try {
    const {accessToken} = await GoogleSignin.getTokens();
    const folderId = await getDriveFolderId(backupType);
    const query = `name contains '${backupType}_' and trashed = false and '${folderId}' in parents`;
    const response = await RNFetchBlob.fetch(
      'GET',
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc`,
      {Authorization: `Bearer ${accessToken}`},
    );
    const {files} = response.json();
    const filesToDelete = files.slice(keepLast);
    if (filesToDelete.length === 0) return;

    await Promise.all(
      filesToDelete.map(async file => {
        await RNFetchBlob.fetch(
          'DELETE',
          `https://www.googleapis.com/drive/v3/files/${file.id}`,
          {Authorization: `Bearer ${accessToken}`},
        );
        console.log(`Deleted old ${backupType} Drive backup: ${file.name}`);
      }),
    );
  } catch (error) {
    console.error(`Error deleting old ${backupType} Drive backups:`, error);
  }
};

// Delete old local backups
async function deleteOldLocalBackups(backupType, keepLast = 0) {
  try {
    const folderPath = LOCAL_BACKUP_FOLDERS[backupType];
    const files = await RNFetchBlob.fs.ls(folderPath);
    const sortedFiles = files
      .filter(file => file.startsWith(`${backupType}_`))
      .sort((a, b) => {
        const timeA = new Date(a.split('_')[1].replace('.json', '')).getTime();
        const timeB = new Date(b.split('_')[1].replace('.json', '')).getTime();
        return timeB - timeA; // Descending
      });
    const filesToDelete = sortedFiles.slice(keepLast);
    if (filesToDelete.length === 0) return;

    await Promise.all(
      filesToDelete.map(async file => {
        const filePath = `${folderPath}/${file}`;
        await RNFetchBlob.fs.unlink(filePath);
        console.log(`Deleted old local ${backupType} backup: ${file}`);
      }),
    );
  } catch (error) {
    console.error(`Error deleting old local ${backupType} backups:`, error);
  }
}

// Process local backup queue (sync to Drive, exclude images)
async function processLocalBackupQueue() {
  const netInfo = await NetInfo.fetch();
  if (!netInfo.isConnected) return;

  // for (const [type, localFolder] of Object.entries(LOCAL_BACKUP_FOLDERS)) {
  //   if (type === 'images') continue; // Skip images
  const folderOrder = ['yearly', 'monthly', 'weekly', 'daily', 'images'];
  for (const type of folderOrder) {
    const localFolder = LOCAL_BACKUP_FOLDERS[type];
    const files = await RNFetchBlob.fs.ls(localFolder);
    const sortedFiles = files
      .filter(file => file.endsWith('.json'))
      .sort((a, b) => {
        const timeA = new Date(a.split('_')[1].replace('.json', '')).getTime();
        const timeB = new Date(b.split('_')[1].replace('.json', '')).getTime();
        return timeA - timeB; // Ascending, upload oldest first
      });

    let allUploaded = true;
    for (const file of sortedFiles) {
      const filePath = `${localFolder}/${file}`;
      try {
        const folderId = await getDriveFolderId(type);
        const uploadResult = await retryOnFailure(
          async () => {
            const result = await uploadToGoogleDrive(
              filePath,
              file,
              'application/json',
              folderId,
            );
            if (!(await verifyGoogleDriveUpload(result.id))) {
              throw new Error(`${type} upload verification failed`);
            }
            return result;
          },
          {maxRetries: 3, delayMs: 5000},
        );
        await RNFetchBlob.fs.unlink(filePath);
        console.log(`Synced and deleted local ${type} backup: ${file}`);
      } catch (error) {
        console.error(`Failed to sync local ${type} backup ${file}:`, error);
        allUploaded = false;
        // Leave in local for retry
      }
    }

    if (sortedFiles.length > 0 && allUploaded && type !== 'images') {
      // Apply clearing if differential
      const lowerLevels = {
        yearly: ['monthly', 'weekly', 'daily'],
        monthly: ['weekly', 'daily'],
        weekly: ['daily'],
        daily: [],
      }[type] ?? [];
      for (const level of lowerLevels) {
        await deleteOldDriveBackups(level, 0); // Clear on Drive
        await deleteOldLocalBackups(level, 0); // Ensure local is clean
      }
    }
  }
}

// Retry helper
const retryOnFailure = async (fn, {maxRetries = 3, delayMs = 5000}) => {
  let attempt = 0;
  let lastError;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt++;
      console.warn(`Attempt ${attempt} failed. Retrying...`, error);
      if (attempt < maxRetries)
        await new Promise(res => setTimeout(res, delayMs));
    }
  }
  throw lastError;
};

// Main performBackup function
export const performBackup = async () => {
  const {setBackupInProgress,backupInProgress} = useDbStore.getState();
  if (backupInProgress) return;
  setBackupInProgress(true);

  const dbPath = getUserDatabase().getDbPath();
  if (!dbPath) {
    throw new Error('Database not initialized');
  }

  const timestamp = new Date().toISOString();
  const lastBackupTime = await getLastBackupTimestamp();
  console.log(`Last backup time: ${lastBackupTime || 'None'}`);

  const netInfo = await NetInfo.fetch();
  // const isConnected = false;
  const isConnected = netInfo.isConnected;

  try {
    await initializeLocalFolders(); // Ensure local folders (excl. images)
    if (isConnected) {
      await initializeDriveFolders();
      await processLocalBackupQueue(); // Sync pending non-image locals
    }

    // Prepare and store images incremental backup locally
    const imagesChanges = await prepareIncrementalBackup(lastBackupTime, [
      'images',
    ]);
    if (!isEmptyData({images: imagesChanges.images})) {
      const tempFilePath = `${LOCAL_BACKUP_FOLDERS.images}/images_${timestamp}.json`;
      await RNFetchBlob.fs.writeFile(
        tempFilePath,
        JSON.stringify({images: imagesChanges.images}),
        'utf8',
      );

      if (isConnected) {
        // Images incremental (only when connected)
        const imagesFolderId = await getDriveFolderId('images');
        await retryOnFailure(
          async () => {
            const result = await uploadToGoogleDrive(
              tempFilePath,
              `images_${timestamp}.json`,
              'application/json',
              imagesFolderId,
            );
            if (!(await verifyGoogleDriveUpload(result.id)))
              throw new Error('Images upload verification failed');
            await RNFetchBlob.fs.unlink(tempFilePath);
          },
          {maxRetries: 3, delayMs: 5000},
        );
      }
    }

    // Hierarchical backups (non-images)
    let backupType = null;
    let lowerLevelsToClear = [];
    let data = null;
    if (isEndOfYear()) {
      const {start, end} = getYearStartEndDates();
      data = await exportDataBetweenDates(start, end);
      backupType = 'yearly';
      lowerLevelsToClear = ['monthly', 'weekly', 'daily'];
    } else if (isEndOfMonth()) {
      const {start, end} = getMonthStartEndDates();
      data = await exportDataBetweenDates(start, end);
      backupType = 'monthly';
      lowerLevelsToClear = ['weekly', 'daily'];
    } else if (isEndOfWeek()) {
      const {start, end} = getWeekStartEndDates();
      data = await exportDataBetweenDates(start, end);
      backupType = 'weekly';
      lowerLevelsToClear = ['daily'];
    } else {
      data = await prepareIncrementalBackup(lastBackupTime);
      backupType = 'daily';
      lowerLevelsToClear = [];
    }

    if (backupType && !isEmptyData(data)) {
      const localFolder = LOCAL_BACKUP_FOLDERS[backupType];
      const filePath = `${localFolder}/${backupType}_${timestamp}.json`;
      await RNFetchBlob.fs.writeFile(filePath, JSON.stringify(data), 'utf8');

      // Always apply local clearing for differentials
      for (const level of lowerLevelsToClear) {
        await deleteOldLocalBackups(level, 0);
        console.log(`Cleared local ${level} after ${backupType} backup`);
      }

      if (isConnected) {
        const folderId = await getDriveFolderId(backupType);
        await retryOnFailure(
          async () => {
            const result = await uploadToGoogleDrive(
              filePath,
              `${backupType}_${timestamp}.json`,
              'application/json',
              folderId,
            );
            if (!(await verifyGoogleDriveUpload(result.id)))
              throw new Error(`${backupType} upload verification failed`);

            // Clear on Drive
            for (const level of lowerLevelsToClear) {
              await deleteOldDriveBackups(level, 0);
            }
            await RNFetchBlob.fs.unlink(filePath);
          },
          {maxRetries: 3, delayMs: 5000},
        );
      } // Else: Leave in local, already cleared lowers
    }

    await saveBackupTimestamp();
    return {success: true, timestamp};
  } catch (error) {
    console.error('Backup failed:', error);
    return {success: false, error: error.message};
  } finally {
    setBackupInProgress(false);
  }
};

// Perform backup task
export const performBackupTask = async () => {
  console.log(
    `[BackupTask] Starting backup at: ${new Date().toLocaleString()}`,
  );
  const userId = await AsyncStorage.getItem('userId');
  if (!userId) return;
  const db = await initUserDatabase(userId);

  try {
    const result = await performBackup();
    if (result.success) {
      console.log('[BackupTask] Completed');
    } else {
      console.error('[BackupTask] Failed:', result.error);
    }
  } catch (error) {
    console.error('[BackupTask] Failed:', error);
  }
};

// Configure background backup
export const configureBackgroundBackup = () => {
  BackgroundFetch.configure(
    {
      minimumFetchInterval: 60 * 24, // Daily
      stopOnTerminate: false,
      startOnBoot: true,
    },
    async taskId => {
      await performBackupTask();
      BackgroundFetch.finish(taskId);
    },
    error => {
      console.error('[BackgroundFetch] Failed to configure:', error);
    },
  );
};

// Trigger on connectivity change or app resume
// NetInfo.addEventListener(state => {
//   if (state.isConnected) {
//     console.log('Internet reconnected, processing backups');
//     performBackupTask();
//   }
// });

// AppState.addEventListener('change', state => {
//   if (state === 'active') {
//     console.log('App resumed, triggering backup');
//     performBackupTask();
//   }
// });
