import RNFetchBlob from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import NetInfo from '@react-native-community/netinfo';
import {saveBackupSyncTimestamp} from './backupUtils';
import useBackupStore from '../stores/backupStore';
import useSettingsStore from '../Settings/settingsStore';
import {NativeModules} from 'react-native';
import {
  getLocalFiles,
  getGhostFiles,
  updateState,
  deleteFile,
} from './BackupDbService';
import useDbStore from '../database/dbStore';
import {runBackupDriveSync} from '../backgroundService/newBackgroundService';
import { getGoogleAccessToken } from '../auth/tokenManager';

// =========================
// CONSTANTS
// =========================
const BACKUP_FOLDER = `${RNFetchBlob.fs.dirs.DocumentDir}/backups`;
export const DRIVE_MAIN_FOLDER_NAME = 'AppBackups';
const IMAGE_DIR = `${BACKUP_FOLDER}/images`;

// =========================
// RETRY UTILITY
// =========================
const retry = async (fn, retries = 3) => {
  let lastError;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const status = e?.status || e?.response?.status;

      if (status && status >= 400 && status < 500 && status !== 429) {
        console.error('[RETRY] Non-retriable error:', status);
        throw e;
      }

      const delay = Math.pow(2, i) * 1000 + Math.random() * 300;
      console.warn(`[RETRY] Attempt ${i + 1} failed. Retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.error('[RETRY] All attempts failed');
  throw lastError;
};

// =========================
// CONCURRENCY RUNNER
// =========================
const runWithLimit = async (tasks, limit = 3) => {
  const queue = [...tasks];

  const workers = Array.from({length: limit}).map(async (_, index) => {
    while (queue.length) {
      const task = queue.shift();
      if (task) {
        try {
          await task();
        } catch (e) {
          console.error(`[WORKER ${index}] Task failed:`, e);
        }
      }
    }
  });

  await Promise.all(workers);
};

// =========================
// DRIVE FOLDER MANAGEMENT
// =========================
export async function getOrCreateDriveFolder(folderName, parentId = 'root') {
  try {
    const accessToken = await getGoogleAccessToken();
    const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`;

    const response = await RNFetchBlob.fetch(
      'GET',
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`  ,
      {Authorization: `Bearer ${accessToken}`},
    );

    console.log('[drive] Folder query response:', response.data);

    const {files} = response.json();

    if (files?.length > 0) {
      console.log(`[DRIVE] Folder found: ${folderName} (${files[0].id})`);
      return files[0].id;
    }

    console.log(`[DRIVE] Creating folder: ${folderName}`);

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

    console.log(`[DRIVE] Folder created: ${folderName} (${newFolder.id})`);
    return newFolder.id;
  } catch (error) {
    console.error(`[DRIVE] Folder error (${folderName}):`, error);
    throw error;
  }
}

export async function initializeDriveFolders() {
  const net = await NetInfo.fetch();
  if (!net.isConnected || !net.isInternetReachable) {
    return;
  }
  console.log('[INIT] Initializing Drive folders');

  const root = await getOrCreateDriveFolder(DRIVE_MAIN_FOLDER_NAME);
  const images = await getOrCreateDriveFolder('images', root);

  const data = {root, images};

  await AsyncStorage.setItem('driveFolderIds', JSON.stringify(data));

  console.log('[INIT] Folder IDs stored:', data);

  return data;
}

// =========================
// DRIVE FILE OPERATIONS
// =========================
export const uploadToGoogleDrive = async (
  filePath,
  fileName,
  folderId = 'root',
) => {
  const accessToken = await getGoogleAccessToken();

  console.log(`[UPLOAD] Uploading: ${fileName}`);

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
        data: JSON.stringify({name: fileName, parents: [folderId]}),
        type: 'application/json',
      },
      {
        name: 'file',
        filename: fileName,
        data: RNFetchBlob.wrap(filePath),
      },
    ],
  );

  const status = response.info().status;

  if (status >= 400) {
    console.error(`[UPLOAD] Failed (${fileName}) → Status: ${status}`);
    const error = new Error(`Upload failed: ${response.data}`);
    error.status = status;
    throw error;
  }

  console.log(`[UPLOAD] Success: ${fileName}`);

  return response.json();
};

export const findDriveFileByName = async (fileName, folderId) => {
  const accessToken = await getGoogleAccessToken();

  const query = `name='${fileName}' and trashed=false and '${folderId}' in parents`;

  const res = await RNFetchBlob.fetch(
    'GET',
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    {Authorization: `Bearer ${accessToken}`},
  );

  return res.json().files?.[0] || null;
};

const deleteDriveFile = async driveId => {
  const accessToken = await getGoogleAccessToken();

  const res = await RNFetchBlob.fetch(
    'DELETE',
    `https://www.googleapis.com/drive/v3/files/${driveId}`,
    {Authorization: `Bearer ${accessToken}`},
  );

  const status = res.info().status;

  if (status === 404) {
    console.log('[DELETE] Already removed from Drive');
    return;
  }

  if (status >= 400) {
    console.error('[DELETE] Failed → status:', status);
    const err = new Error('Delete failed');
    err.status = status;
    throw err;
  }

  console.log('[DELETE] Drive file deleted:', driveId);
};

// =========================
// TASK FACTORIES
// =========================
const makeUploadTask =
  (localPath, fileName, folderId, options = {}) =>
  async () => {
    const {onMissing, onSynced, deleteAfterUpload = true} = options;

    const exists = await RNFetchBlob.fs.exists(localPath);

    if (!exists) {
      console.warn('[SYNC] Missing local file:', fileName);
      await onMissing?.();
      return;
    }

    try {
      const existing = await findDriveFileByName(fileName, folderId);

      if (existing) {
        console.log('[SYNC] Already exists on Drive:', fileName);

        await onSynced?.(existing.id);

        if (await RNFetchBlob.fs.exists(localPath)) {
          await RNFetchBlob.fs.unlink(localPath);
        }

        return;
      }

      const result = await retry(() =>
        uploadToGoogleDrive(localPath, fileName, folderId),
      );

      await onSynced?.(result.id);

      if (deleteAfterUpload && (await RNFetchBlob.fs.exists(localPath))) {
        await RNFetchBlob.fs.unlink(localPath);
      }
    } catch (e) {
      console.error('[SYNC] Upload failed:', fileName, e);
    }
  };

const makeDeleteTask = (file, initialDriveId, folderId) => async () => {
  let drive_id = initialDriveId;
  let alreadyGone = false;

  try {
    await retry(async () => {
      if (!drive_id) {
        const existing = await findDriveFileByName(file, folderId);

        if (!existing) {
          console.log('[SYNC] Already deleted on Drive:', file);
          alreadyGone = true;
          return;
        }

        drive_id = existing.id;
      }

      await deleteDriveFile(drive_id);
    });

    if (drive_id || alreadyGone) {
      await deleteFile(file);
      console.log('[SYNC] Ghost removed:', file);
    }
  } catch (e) {
    console.error('[SYNC] Ghost delete failed:', file, e);
  }
};

// =========================
// SYNC PHASES
// =========================
async function uploadLocalBackups(folderId) {
  console.log('[PHASE] Upload local backups');

  const localFiles = await getLocalFiles();

  console.log(`[SYNC] Found ${localFiles.length} local files to sync`);

  const tasks = localFiles.map(({file, level}) =>
    makeUploadTask(`${BACKUP_FOLDER}/L${level}/${file}`, file, folderId, {
      onMissing: () => updateState(file, 'synced'),
      onSynced: id => updateState(file, 'synced', id),
    }),
  );

  await runWithLimit(tasks, 3);
}

async function deleteGhostBackups(folderId) {
  console.log('[PHASE] Delete ghost files');

  const ghostFiles = await getGhostFiles();

  const tasks = ghostFiles.map(({file, drive_id}) =>
    makeDeleteTask(file, drive_id, folderId),
  );

  await runWithLimit(tasks, 3);
}

async function syncImageFiles(folderId) {
  console.log('[PHASE] Sync images');

  if (!(await RNFetchBlob.fs.exists(IMAGE_DIR))) return;

  const files = await RNFetchBlob.fs.ls(IMAGE_DIR);

  if (!files?.length) {
    console.log('[IMG] No images found');
    return;
  }

  const tasks = files.map(file =>
    makeUploadTask(`${IMAGE_DIR}/${file}`, file, folderId),
  );

  await runWithLimit(tasks, 3);
}

// =========================
// CORE SYNC
// =========================
async function syncFiles() {
  const folderIds = await initializeDriveFolders();

  await uploadLocalBackups(folderIds.root);
  await deleteGhostBackups(folderIds.root);
  await syncImageFiles(folderIds.images);
}

// =========================
// PUBLIC ENTRY
// =========================
export const syncBackupsToDrive = async () => {
  const {setBackupInProgress, backupInProgress} = useDbStore.getState();
  try {
    if (backupInProgress) {
      console.log('[SYNC] Backup already in progress, skipping');
      return;
    }
    setBackupInProgress(true);

    const settings = useSettingsStore.getState().settings;

    if (!settings.BACKUP_ENABLED) {
      console.log('[SYNC] Backup disabled');
      return;
    }

    const net = await NetInfo.fetch();
    if (!net.isConnected || !net.isInternetReachable) {
      console.warn('[SYNC] No internet connection');
      return;
    }

    console.log('[SYNC] Network Status: Connected and Internet Reachable' );

    const userId = await AsyncStorage.getItem('userId');

    const lastNativeBackup = await NativeModules.BackupModule.getPreference(
      `LAST_NATIVE_BACKUP_TIME_${userId}`,
    );

    if (!lastNativeBackup) {
      console.log('[SYNC] No native backup found');
      return;
    }

    const lastDriveSync = settings.LAST_BACKUP_SYNC_TIME;

    const nativeTime = new Date(lastNativeBackup).getTime();
    const driveTime = lastDriveSync ? new Date(lastDriveSync).getTime() : 0;
    console.log(
      `[SYNC] Last native backup: ${lastNativeBackup} (${nativeTime})`,
    );
    console.log(`[SYNC] Last Drive sync: ${lastDriveSync} (${driveTime})`);
    if (driveTime >= nativeTime) {
      console.log('[SYNC] Already up to date');
    } else {
      console.log('[SYNC] Starting Drive sync...');

      await syncFiles();

      console.log('[SYNC] Completed successfully');
    }
    await saveBackupSyncTimestamp();
    await useBackupStore.getState().refreshLastBackupTime();
  } catch (e) {
    console.error('[SYNC] Failed:', e);
  } finally {
    setBackupInProgress(false);
    console.log('[SYNC] Sync process ended');
  }
};

// export const setBackupSyncNetworkListener = async () => {
//   NetInfo.addEventListener(state => {
//     console.log('Network change detected');
//     if (state.isConnected && state.isInternetReachable) {
//       console.log('Internet available, triggering backup sync');
//       runBackupDriveSync('Network Change');
//     } else {
//       console.log('No internet connection');
//     }
//   });
// };
