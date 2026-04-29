import {Alert} from 'react-native';
import RNFetchBlob from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getDb} from '../database/database';
import useDbStore from '../database/dbStore';
import {getGoogleAccessToken} from '../auth/tokenManager';
import {extractEpochs} from '../Settings/BackupExplorerScreen';
import useBackupStore from '../stores/backupStore';
import { runRestoreInBackground } from '../backgroundService/newBackgroundService';

/* ---------------------------------- */
/* Constants                           */
/* ---------------------------------- */

export const DRIVE_MAIN_FOLDER_NAME = 'AppBackups';

const TABLE_ORDER = [
  'categories',
  'notebooks',
  'items',
  'youtube_meta',
  'category_items',
  'notes',
  'video_watch_history',
  'images',
];

/* ---------------------------------- */
/* Restore state helpers               */
/* ---------------------------------- */

const restoreKey = userId => `restoreCheckCompleted_${userId}`;
const restoreLockKey = userId => `restoreInProgress_${userId}`;

export async function hasRestoreCheckCompleted(userId) {
  console.log('[Restore] Checking restore completed for:', userId);
  const res = (await AsyncStorage.getItem(restoreKey(userId))) === 'true';
  console.log('[Restore] Restore completed:', res);
  return res;
}

export async function markRestoreCheckCompleted(userId) {
  console.log('[Restore] Marking restore completed for:', userId);
  await AsyncStorage.setItem(restoreKey(userId), 'true');
}

async function acquireRestoreLock(userId) {
  console.log('[Restore] Acquiring lock for:', userId);
  const locked = await AsyncStorage.getItem(restoreLockKey(userId));

  if (locked === 'true') {
    console.error('[Restore] Lock already acquired!');
    throw new Error('Restore already in progress');
  }

  await AsyncStorage.setItem(restoreLockKey(userId), 'true');
  console.log('[Restore] Lock acquired');
}

async function releaseRestoreLock(userId) {
  console.log('[Restore] Releasing lock for:', userId);
  await AsyncStorage.removeItem(restoreLockKey(userId));
}

/* ---------------------------------- */
/* Utilities                           */
/* ---------------------------------- */

const parseTimestampFromName = name => {
  const match = name.match(/_(\d+)-(\d+)\.json$/);
  const ts = match ? Number(match[2]) : null;
  console.log('[Restore] Parsed timestamp from', name, '→', ts);
  return ts;
};

/* ---------------------------------- */
/* Drive listing                       */
/* ---------------------------------- */

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

export async function listAllDriveBackups() {
  console.log('[Restore] Listing all Drive backups');

  const accessToken = await getGoogleAccessToken();
  console.log('[Restore] Got access token');

  const all = [];

  const rootFolderId = await getOrCreateDriveFolder(DRIVE_MAIN_FOLDER_NAME);
  console.log('[Restore] Root folder ID:', rootFolderId);

  const rootRes = await RNFetchBlob.fetch(
    'GET',
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `'${rootFolderId}' in parents and trashed=false`,
    )}&fields=files(id,name,mimeType)`,
    {Authorization: `Bearer ${accessToken}`},
  );

  const rootFiles = rootRes.json().files || [];
  console.log('[Restore] Root files:', rootFiles.length);

  const imageFolder = rootFiles.find(
    f =>
      f.name === 'images' &&
      f.mimeType === 'application/vnd.google-apps.folder',
  );

  console.log('[Restore] Image folder found:', !!imageFolder);

  let imageFiles = [];

  if (imageFolder) {
    console.log('[Restore] Fetching image folder contents');

    const imgRes = await RNFetchBlob.fetch(
      'GET',
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `'${imageFolder.id}' in parents and trashed=false`,
      )}&fields=files(id,name)`,
      {Authorization: `Bearer ${accessToken}`},
    );

    imageFiles = imgRes.json().files || [];
    console.log('[Restore] Image files:', imageFiles.length);
  }

  const allFiles = [...rootFiles, ...imageFiles];

  for (const f of allFiles) {
    if (!f.name.endsWith('.json')) continue;

    const ts = parseTimestampFromName(f.name);
    if (!ts) continue;

    console.log('[Restore] Valid backup file:', f.name);

    all.push({
      id: f.id,
      name: f.name,
      timestamp: ts,
    });
  }

  console.log('[Restore] Total backups found:', all.length);
  return all;
}

/* ---------------------------------- */
/* Download                            */
/* ---------------------------------- */

async function downloadBackup(fileId) {
  console.log('[Restore] Downloading backup:', fileId);

  const accessToken = await getGoogleAccessToken();

  const res = await RNFetchBlob.fetch(
    'GET',
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {Authorization: `Bearer ${accessToken}`},
  );

  if (res.info().status >= 400) {
    console.error('[Restore] Download failed:', fileId);
    throw new Error('Failed to download backup');
  }

  const parsed = JSON.parse(res.text());
  console.log('[Restore] Download successful:', fileId);

  return parsed;
}

/* ---------------------------------- */
/* Main restore pipeline               */
/* ---------------------------------- */

async function runRestore(userId, backups) {
  console.log('[Restore] Starting restore for user:', userId);

  const {setRestoreInProgress} = useDbStore.getState();
  const db = getDb();

  await acquireRestoreLock(userId);
  setRestoreInProgress(true);

  try {
    const dbBackups = backups.filter(b => b.name.startsWith('L'));
    const imageBackups = backups.filter(b => b.name.startsWith('img_'));

    console.log('[Restore] DB backups:', dbBackups.length);
    console.log('[Restore] Image backups:', imageBackups.length);

    dbBackups.sort((a, b) => a.timestamp - b.timestamp);
    imageBackups.sort((a, b) => a.timestamp - b.timestamp);

    const dbDataList = [];
    for (const b of dbBackups) {
      console.log('[Restore] Downloading DB backup:', b.name);
      const data = await downloadBackup(b.id);
      if (data) dbDataList.push({name: b.name, data, driveId: b.id});
    }

    const imageDataList = [];
    for (const b of imageBackups) {
      console.log('[Restore] Downloading image backup:', b.name);
      const data = await downloadBackup(b.id);
      if (data) imageDataList.push({name: b.name, data});
    }

    console.log('[Restore] Starting DB transaction');

    await new Promise((resolve, reject) => {
      db.transaction(
        tx => {
          tx.executeSql('PRAGMA defer_foreign_keys = ON');

          for (const {name, data, driveId} of dbDataList) {
            console.log('[Restore] Inserting DB backup:', name);
            insertData(data, name, tx);
            upsertBackupFileEntry(tx, name, driveId);
          }

          for (const {name, data} of imageDataList) {
            console.log('[Restore] Inserting image backup:', name);
            insertData(data, name, tx);
          }

          tx.executeSql(
            `INSERT INTO notes(notes) VALUES('rebuild')`,
            [],
            () => console.log('[Restore] FTS index rebuilt'),
            (_, err) => {
              console.error('[Restore] FTS rebuild failed:', err);
              return true;
            }
          );
        },
        err => {
          console.error('[Restore] Transaction failed:', err);
          reject(err);
        },
        () => {
          console.log('[Restore] Transaction success');
          resolve();
        },
      );
    });
  } finally {
    console.log('[Restore] Finishing restore');
    setRestoreInProgress(false);
    await releaseRestoreLock(userId);
  }
}

const insertData = (data, label, tx) => {
  console.log('[Restore] insertData called for:', label);

  for (const table of TABLE_ORDER) {
    if (!Array.isArray(data[table])) continue;

    console.log(`[Restore] Table ${table} → rows: ${data[table].length}`);

    for (const row of data[table]) {
      // 🔥 SPECIAL HANDLING FOR FTS NOTES (preserve rowid)
      if (table === 'notes' && row.rowid != null) {
        const {rowid, ...rest} = row;

        const cols = Object.keys(rest);
        const vals = Object.values(rest);

        const qs = ['?', ...cols.map(() => '?')].join(',');

        tx.executeSql(
          `INSERT OR REPLACE INTO notes (rowid, ${cols.join(',')}) VALUES (${qs})`,
          [rowid, ...vals],
          () => {},
          (_, error) => {
            console.error(`[Restore ERROR] ${label} → notes`, error);
            return true;
          },
        );

        continue;
      }

      // ✅ default for all other tables
      const cols = Object.keys(row);
      const vals = Object.values(row);
      const qs = cols.map(() => '?').join(',');

      tx.executeSql(
        `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${qs})`,
        vals,
        () => {},
        (_, error) => {
          console.error(`[Restore ERROR] ${label} → ${table}`, error);
          return true;
        },
      );
    }
  }
};

const upsertBackupFileEntry = (tx, fileName, driveId) => {
  // ✅ skip image backups completely
  if (fileName.startsWith('img_')) {
    console.log('[Restore] Skipping backup_files entry for image:', fileName);
    return;
  }

  const meta = extractEpochs(fileName);

  if (meta.level == null || meta.start == null || meta.end == null) {
    console.error('[Restore] Invalid backup meta:', fileName);
    return;
  }

  tx.executeSql(
    `INSERT OR REPLACE INTO backup_files 
     (file, level, start_epoch, end_epoch, state, drive_id)
     VALUES (?, ?, ?, ?, 'synced', ?)`,
    [fileName, meta.level, meta.start, meta.end, driveId],
    () => {
      console.log('[Restore] backup_files updated:', fileName);
    },
    (_, err) => {
      console.error('[Restore] backup_files error:', err);
      return true;
    },
  );
};

/* ---------------------------------- */
/* UI Flow                             */
/* ---------------------------------- */

export async function attemptRestore(userId, backups) {
  console.log('[Restore] attemptRestore triggered');
  await runRestore(userId, backups);
  await markRestoreCheckCompleted(userId);
}

async function handleRestoreFlow(userId, backups) {
  console.log('[Restore] handleRestoreFlow started');

  try {
    // Start background restore
    await runRestoreInBackground(userId, backups);
  } catch (e) {
    console.error('[Restore] Failed', e);

    Alert.alert(
      'Restore Failed',
      'Restore could not be completed.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Retry', onPress: () => handleRestoreFlow(userId, backups)},
      ],
      {cancelable: false},
    );
  }
}

export async function checkAndPromptRestore(userId) {
  console.log('[Restore] checkAndPromptRestore called');

  const {currentUserId, setCheckingAvailableBackup} = useDbStore.getState();

  if (!currentUserId) {
    console.log('[Restore] No user ID found');
    return;
  }

  if (await hasRestoreCheckCompleted(currentUserId)) {
    console.log('[Restore] Already checked, skipping');
    return;
  }

  setCheckingAvailableBackup(true);

  try {
    const backups = await listAllDriveBackups();
    setCheckingAvailableBackup(false);

    if (!backups.length) {
      console.log('[Restore] No backups found');
      Alert.alert('No Backup Found', 'No backups available.');
      await markRestoreCheckCompleted(currentUserId);
      return;
    }

    console.log('[Restore] Backup found, prompting user');

    // Return a promise that resolves when user makes a choice
    return new Promise((resolve) => {
      Alert.alert(
        'Backup Found',
        'A backup was found for your account. Restore now?',
        [
          {
            text: 'Skip',
            style: 'cancel',
            onPress: async () => {
              console.log('[Restore] User skipped restore');
              await markRestoreCheckCompleted(currentUserId);
              resolve(); // Resolve the promise
            },
          },
          {
            text: 'Restore',
            onPress: () => {
              console.log('[Restore] User accepted restore');
              // Start background restore
              handleRestoreFlow(currentUserId, backups).then(() => {
                resolve(); // Resolve when restore flow completes
              });
            },
          },
        ],
        {cancelable: false},
      );
    });
  } catch (e) {
    console.error('[Restore] Fatal error', e);
  } finally {
    setCheckingAvailableBackup(false);
    //setnativePref last backup time to now bcz anyway whatever is restored is in drive
    // and now whatever will go will be from the instance app is installed and used so backup time is now
    //we are doing here bcz this runs only once when user logs in for the first time
    // and if we do it in backup routine then it will update the backup time every time backup runs which is not correct
    // because backup can run multiple times a day but we want to show last backup sync time as the time when user logged in and checked for backup
    await useBackupStore
      .getState()
      .setNativePreference(
        'LAST_NATIVE_BACKUP_TIME_' + userId,
        formatDateTime(),
      );
  }
}

export const formatDateTime = (date = new Date()) => {
  // Returns "2024-01-15 15:30:45" UTC format
  return date.toISOString().replace('T', ' ').substring(0, 19);
};
