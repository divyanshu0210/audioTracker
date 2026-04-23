import {Alert} from 'react-native';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import RNFetchBlob from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getDb} from '../database/database';
import useDbStore from '../database/dbStore';
import {
  DRIVE_MAIN_FOLDER_NAME,
  getOrCreateDriveFolder,
} from '../backupAdv/backupNew';

/* ---------------------------------- */
/* Constants                           */
/* ---------------------------------- */

const IMAGE_FOLDER = 'images';

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

export async function listAllDriveBackups() {
  console.log('[Restore] Listing all Drive backups');

  const {accessToken} = await GoogleSignin.getTokens();
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

  const {accessToken} = await GoogleSignin.getTokens();

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
      if (data) dbDataList.push({name: b.name, data});
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

          for (const {name, data} of dbDataList) {
            console.log('[Restore] Inserting DB backup:', name);
            insertData(data, name, tx);
          }

          for (const {name, data} of imageDataList) {
            console.log('[Restore] Inserting image backup:', name);
            insertData(data, name, tx);
          }
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

async function attemptRestore(userId, backups) {
  console.log('[Restore] attemptRestore triggered');
  await runRestore(userId, backups);
  await markRestoreCheckCompleted(userId);
}

/* ---------------------------------- */
/* UI Flow                             */
/* ---------------------------------- */

async function handleRestoreFlow(userId, backups) {
  console.log('[Restore] handleRestoreFlow started');

  try {
    await attemptRestore(userId, backups);

    console.log('[Restore] Restore completed successfully');

    Alert.alert(
      'Restore Complete',
      'Your data has been restored successfully.',
    );
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

export async function checkAndPromptRestore() {
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
          },
        },
        {
          text: 'Restore',
          onPress: () => {
            console.log('[Restore] User accepted restore');
            handleRestoreFlow(currentUserId, backups);
          },
        },
      ],
      {cancelable: false},
    );
  } catch (e) {
    console.error('[Restore] Fatal error', e);
  }
}