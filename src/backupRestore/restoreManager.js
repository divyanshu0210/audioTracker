import {Alert} from 'react-native';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import RNFetchBlob from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getDb} from '../database/database';
import useDbStore from '../database/dbStore';

/* ---------------------------------- */
/* Constants                           */
/* ---------------------------------- */

const DRIVE_BACKUP_FOLDERS = ['yearly', 'monthly', 'weekly', 'daily'];
const IMAGE_FOLDER = 'images';

const TABLE_ORDER = [
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
  'images',
];

/* ---------------------------------- */
/* Restore state helpers               */
/* ---------------------------------- */

const restoreKey = userId => `restoreCheckCompleted_${userId}`;
const restoreLockKey = userId => `restoreInProgress_${userId}`;

export async function hasRestoreCheckCompleted(userId) {
  return (await AsyncStorage.getItem(restoreKey(userId))) === 'true';
}

export async function markRestoreCheckCompleted(userId) {
  await AsyncStorage.setItem(restoreKey(userId), 'true');
}

async function acquireRestoreLock(userId) {
  await AsyncStorage.removeItem(restoreLockKey(userId));

  const locked = await AsyncStorage.getItem(restoreLockKey(userId));
  if (locked === 'true') {
    throw new Error('Restore already in progress');
  }
  await AsyncStorage.setItem(restoreLockKey(userId), 'true');
}


async function releaseRestoreLock(userId) {
  await AsyncStorage.removeItem(restoreLockKey(userId));
}

/* ---------------------------------- */
/* Utilities                           */
/* ---------------------------------- */

const parseTimestampFromName = name => {
  const match = name.match(/_(\d{4}-\d{2}-\d{2}T[^.]+(?:\.\d+)?Z?)\.json$/);
  return match ? new Date(match[1]).getTime() : null;
};

/* ---------------------------------- */
/* Drive listing                       */
/* ---------------------------------- */

export async function listAllDriveBackups() {
  const {accessToken} = await GoogleSignin.getTokens();
  const all = [];

  for (const folder of [...DRIVE_BACKUP_FOLDERS, IMAGE_FOLDER]) {
    const q = `name contains '${folder}_' and name contains '.json' and trashed=false`;

    console.log(`[Restore] Listing Drive backups for folder: ${folder}`);

    const res = await RNFetchBlob.fetch(
      'GET',
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        q,
      )}&fields=files(id,name,createdTime)`,
      {Authorization: `Bearer ${accessToken}`},
    );

    const files = res.json().files || [];

    for (const f of files) {
      const ts = parseTimestampFromName(f.name);
      if (!ts) continue;

      all.push({
        id: f.id,
        name: f.name,
        folder,
        timestamp: ts,
      });
    }
  }

  console.log(`[Restore] Total backups found: ${all.length}`);
  return all;
}

/* ---------------------------------- */
/* Download                            */
/* ---------------------------------- */

async function downloadBackup(fileId) {
  const {accessToken} = await GoogleSignin.getTokens();

  const res = await RNFetchBlob.fetch(
    'GET',
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {Authorization: `Bearer ${accessToken}`},
  );

  if (res.info().status >= 400) {
    throw new Error('Failed to download backup');
  }

  return JSON.parse(res.text());
}

/* ---------------------------------- */
/* DB restore                          */
/* ---------------------------------- */

async function insertDataToTables(data) {
  const db = getDb();

  await new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        for (const table of TABLE_ORDER) {
          if (!Array.isArray(data[table])) continue;

          console.log(
            `[Restore] Inserting ${data[table].length} rows into ${table}`,
          );

          for (const row of data[table]) {
            const cols = Object.keys(row);
            const vals = Object.values(row);
            const qs = cols.map(() => '?').join(',');

            tx.executeSql(
              `INSERT OR REPLACE INTO ${table} (${cols.join(
                ',',
              )}) VALUES (${qs})`,
              vals,
            );
          }
        }
      },
      reject,
      resolve,
    );
  });
}

async function runPragma(sql) {
  const db = getDb();

  return new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        tx.executeSql(sql);
      },
      reject,
      resolve,
    );
  });
}

/* ---------------------------------- */
/* Main restore pipeline               */
/* ---------------------------------- */
async function runRestore(userId, backups) {
  const {setRestoreInProgress} = useDbStore.getState();

  await acquireRestoreLock(userId);
  setRestoreInProgress(true);

  console.log('[Restore] Restore started');

  try {
    console.log('[Restore] Disabling foreign keys');
    await runPragma('PRAGMA foreign_keys = OFF');

    const imageBackups = backups.filter(b => b.folder === IMAGE_FOLDER);
    const dbBackups = backups.filter(b => b.folder !== IMAGE_FOLDER);

    dbBackups.sort((a, b) => a.timestamp - b.timestamp);
    imageBackups.sort((a, b) => a.timestamp - b.timestamp);

    console.log(
      `[Restore] DB backups: ${dbBackups.length}, Image backups: ${imageBackups.length}`,
    );

    for (const b of dbBackups) {
      console.log(`[Restore] Restoring ${b.name}`);
      const data = await downloadBackup(b.id);
      await insertDataToTables(data);
    }

    for (const b of imageBackups) {
      console.log(`[Restore] Restoring images ${b.name}`);
      const data = await downloadBackup(b.id);
      await insertDataToTables(data);
    }

    console.log('[Restore] Restore completed successfully');
  } finally {
    console.log('[Restore] Enabling foreign keys');
    await runPragma('PRAGMA foreign_keys = ON');

    setRestoreInProgress(false);
    await releaseRestoreLock(userId);
  }
}


async function attemptRestore(userId, backups) {
  console.log('[Restore] Attempt started');
  await runRestore(userId, backups); // throws if ANY part fails
  await markRestoreCheckCompleted(userId);
  console.log('[Restore] Attempt successful');
}

/* ---------------------------------- */
/* UI entry point                      */
/* ---------------------------------- */

/* ---------------------------------- */
/* Restore + Retry UI                  */
/* ---------------------------------- */

async function handleRestoreFlow(userId, backups) {
  try {
    await attemptRestore(userId, backups);

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
  const {currentUserId, setCheckingAvailableBackup} = useDbStore.getState();

  if (!currentUserId) return;

  if (await hasRestoreCheckCompleted(currentUserId)) {
    console.log('[Restore] Already handled');
    return;
  }

  setCheckingAvailableBackup(true);

  try {
    const backups = await listAllDriveBackups();
    setCheckingAvailableBackup(false);

    if (!backups.length) {
      Alert.alert('No Backup Found', 'No backups available.');
      await markRestoreCheckCompleted(currentUserId);
      return;
    }

    Alert.alert(
      'Backup Found',
      'A backup was found for your account. Restore now?',
      [
        {
          text: 'Skip',
          style: 'cancel',
          onPress: async () => {
            await markRestoreCheckCompleted(currentUserId);
          },
        },
        {
          text: 'Restore',
          onPress: () => handleRestoreFlow(currentUserId, backups),
        },
      ],
      {cancelable: false},
    );
  } catch (e) {
    console.error('[Restore] Fatal error', e);
  }
}
