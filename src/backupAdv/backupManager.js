import {
  compressDatabase,
  exportDatabaseToJson,
  getLastBackupTimestamp,
  prepareImageIncrementalBackup,
  prepareIncrementalBackup,
  saveBackupTimestamp,
} from './backupUtils';
import {
  uploadToGoogleDrive,
  verifyGoogleDriveUpload,
  deleteOldDriveBackups,
} from './googleDriveBackupUtils';
import RNFetchBlob from 'react-native-blob-util';
import useDbStore from '../database/dbStore';
import {getSetting} from '../database/settings';
import {getDatabaseForUser} from '../database/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getUserDatabase,
  initUserDatabase,
} from '../database/UserDatabaseInstance';
import { LOCAL_BACKUP_FOLDERS } from './backupNew';

const BACKUP_FOLDER = `${RNFetchBlob.fs.dirs.DocumentDir}/backups`;
const IMAGES_BACKUP_FOLDER = `${BACKUP_FOLDER}/images`;

export const performBackupTask = async () => {
  console.log(
    `[BackupTask] Starting backup at: ${new Date().toLocaleString()} for loggedIn user`,
  );

  const userId = await AsyncStorage.getItem('userId');
  await initUserDatabase(userId);

  let frequency;
  try {
    const settings = await getSetting('BACKUP_FREQUENCY');
    frequency = settings || 'daily';
    console.log(`[BackupTask] Backup frequency setting: '${frequency}'`);
  } catch (err) {
    console.error('[BackupTask] Error fetching backup frequency:', err);
    frequency = 'daily';
  }

  const backupType = determineBackupType(frequency);
  console.log(`[BackupTask] Performing '${backupType}' backup.`);

  try {
    await performBackup(backupType);
    console.log('[BackupTask] Backup completed successfully');
  } catch (error) {
    console.error('[BackupTask] Backup failed:', error);
  }
};

const determineBackupType = frequency => {
  const today = new Date();

  switch (frequency) {
    case 'monthly':
      return today.getDate() === 1 ? 'full' : 'daily';

    case 'weekly':
      return today.getDay() === 0 ? 'full' : 'daily';

    case 'daily':
    default:
      return today.getDate() === 15 || today.getDate() === 30
        ? 'full'
        : 'daily';
  }
};

export const performBackup = async backupTypeInput => {
  const {setBackupInProgress} = useDbStore.getState();

  const dbPath = getUserDatabase().getDbPath();

  if (!dbPath) {
    console.error('Database or user ID is not initialized');
    throw new Error('Database not initialized');
  }

  setBackupInProgress(true);

  const backupType = backupTypeInput || 'full'; // fallback if undefined

  console.log(`Starting ${backupType} backup...`);

  try {
    console.log(dbPath);
    console.log('Database path retrieved:', dbPath);

    let backupData;
    const timestamp = new Date().toISOString();
    const lastBackupTime = await getLastBackupTimestamp();
    console.log('Last backup timestamp:', lastBackupTime);

    // Always perform incremental backup for images
    console.log('Performing incremental backup for images...');
    const changes = await prepareIncrementalBackup(
      lastBackupTime || '1970-01-01 00:00:00',
      ['images'],
    );
 const isEmptyImages = !changes.images || changes.images.length === 0;

    let imagesBackupData = null;
    if (!isEmptyImages) {
      const imagesPath = `${IMAGES_BACKUP_FOLDER}/images_changes_${timestamp}.json`;
      await RNFetchBlob.fs.writeFile(
        imagesPath,
        JSON.stringify({images: changes.images}),
        'utf8',
      );
      console.log('Images changes written to:', imagesPath);
      imagesBackupData = {
        type: 'incremental',
        filePath: imagesPath,
        fileName: `images_incremental_backup_${timestamp}.json`,
        since: lastBackupTime,
      };
    }

    if (!lastBackupTime || backupType === 'full') {
      console.log('Performing full backup...');
      // const zipPath = await compressDatabase(dbPath, BACKUP_FOLDER);
      // console.log('Database compressed to:', zipPath);

      // backupData = {
      //   type: 'full',
      //   filePath: zipPath,
      //   fileName: `full_backup_${timestamp}.zip`,
      // };
      const fullData = await exportDatabaseToJson(); // New: Export data to JSON
      const isEmpty = Object.values(fullData).every(
        arr => Array.isArray(arr) && arr.length === 0,
      );
      if (isEmpty) {
        console.log('Database is empty. Skipping full backup.');
        return {
          success: true,
          message: 'Empty database; no data to back up.',
          backupType: 'full',
          skipped: true,
          timestamp,
        };
      }

      const dataPath = `${BACKUP_FOLDER}/full_data_${timestamp}.json`;
      await RNFetchBlob.fs.writeFile(
        dataPath,
        JSON.stringify(fullData),
        'utf8',
      );
      console.log('Full data written to:', dataPath);

      backupData = {
        type: 'full',
        filePath: dataPath,
        fileName: `full_backup_${timestamp}.json`, // Changed to .json
      };
    } else {
      console.log('Performing incremental backup(excluding images)...');
      const changes = await prepareIncrementalBackup(lastBackupTime);
      const isEmpty = Object.values(changes).every(
        arr => Array.isArray(arr) && arr.length === 0,
      );

      if (isEmpty) {
        console.log('No changes detected since last backup. Skipping backup.');
        return {
          success: true,
          message: 'No changes to back up.',
          backupType: 'incremental',
          skipped: true,
          timestamp,
        };
      }
      console.log('Incremental changes prepared:', Object.keys(changes));

      const changesPath = `${BACKUP_FOLDER}/changes_${timestamp}.json`;
      await RNFetchBlob.fs.writeFile(
        changesPath,
        JSON.stringify(changes),
        'utf8',
      );
      console.log('Changes written to:', changesPath);

      backupData = {
        type: 'incremental',
        filePath: changesPath,
        fileName: `incremental_backup_${timestamp}.json`,
        since: lastBackupTime,
      };
    }

    if (imagesBackupData) {
      console.log('Uploading images incremental backup to Google Drive...');
      const imagesUploadResult = await retryOnFailure(
        async () => {
          const result = await uploadToGoogleDrive(
            imagesBackupData.filePath,
            imagesBackupData.fileName,
            'application/json',
          );
          if (!(await verifyGoogleDriveUpload(result.id))) {
            throw new Error('Images incremental upload verification failed');
          }
          return result;
        },
        {maxRetries: 3, delayMs: 5000},
      );
      await RNFetchBlob.fs.unlink(imagesBackupData.filePath);
      console.log(
        'Local images incremental backup file deleted:',
        imagesBackupData.filePath,
      );
    }

    // ===== [2] Upload with Retry & Verification =====
    // Upload main backup (full or incremental non-images)
    console.log(`Uploading ${backupData.type} backup to Google Drive...`);
    const uploadResult = await retryOnFailure(
      async () => {
        const result = await uploadToGoogleDrive(
          backupData.filePath,
          backupData.fileName,
          'application/json',
        );
        if (!(await verifyGoogleDriveUpload(result.id))) {
          throw new Error('Upload verification failed');
        }
        return result;
      },
      {maxRetries: 3, delayMs: 5000},
    );

    // ===== [3] Post-Upload Cleanup =====
    // (A) Delete local backup file
    await RNFetchBlob.fs.unlink(backupData.filePath);
    console.log('Local backup file deleted:', backupData.filePath);

    // (B) Delete old backups ONLY after successful upload
    if (backupData.type === 'full') {
      console.log('Cleaning up old full backups...');
      // After successful new full backup:
      await deleteOldDriveBackups('full', 1); // Keep no prv full backups
      await deleteOldDriveBackups('incremental', 0); // Keep no prv incremental backups
    }

    await saveBackupTimestamp();
    console.log(`${backupType} backup completed successfully at ${timestamp}`);

    return {
      success: true,
      backupId: uploadResult.id,
      backupType: backupData.type,
      timestamp,
    };
  } catch (error) {
    console.error(`Backup failed during ${backupType} backup:`, error);
    return {success: false, error: error.message};
  } finally {
    console.log('Backup process finished');
    setBackupInProgress(false);
  }
};

const retryOnFailure = async (fn, {maxRetries = 3, delayMs = 1000}) => {
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
  throw lastError; // All retries failed
};

export const initializeBackupSystem = async () => {
  await ensureFolderExists(BACKUP_FOLDER, 'backup');

    for (const [key, path] of Object.entries(LOCAL_BACKUP_FOLDERS)) {
    await ensureFolderExists(path, `${key} backup`);
  }
};

const ensureFolderExists = async (folderPath, label) => {
  const exists = await RNFetchBlob.fs.exists(folderPath);
  if (!exists) {
    await RNFetchBlob.fs.mkdir(folderPath);
    console.log(`📁 Created ${label} folder at:`, folderPath);
  } else {
    console.log(`📁 ${label} folder already exists at:`, folderPath);
  }
};

// List previous backups (filter by type)
const listPreviousBackups = async (type = 'full') => {
  const files = await RNFetchBlob.fs.ls(BACKUP_FOLDER);
  return files.filter(file =>
    type === 'full'
      ? file.includes('full_backup')
      : file.includes('incremental'),
  );
};

// Delete backup files safely
const deleteBackupFiles = async filePaths => {
  await Promise.all(
    filePaths.map(async file => {
      try {
        await RNFetchBlob.fs.unlink(`${BACKUP_FOLDER}/${file}`);
        console.log('Deleted old backup:', file);
      } catch (error) {
        console.error('Failed to delete backup:', file, error);
      }
    }),
  );
};

//   export const scheduleBackups = () => {
//     // This would integrate with your app's scheduling system
//     // Here's a conceptual implementation

//     return {
//       daily: () => performBackup('daily'),
//       weekly: () => performBackup('weekly'),
//       monthly: () => performBackup('monthly'),
//     };
//   };

export const restoreFromBackup = async backupId => {
  // Implementation would download from Google Drive
  // and restore the database
  // This is more complex and would need careful handling
};
