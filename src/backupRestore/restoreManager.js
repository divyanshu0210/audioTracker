import {Alert} from 'react-native';
import RNFetchBlob from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getDb} from '../database/database';
import {getGoogleAccessToken} from '../auth/tokenManager';
import {extractEpochs} from '../Settings/BackupExplorerScreen';
import useBackupStore from '../stores/backupStore';
import useRestoreStore from './restoreStore';
import {decodeHtmlEntities} from '../notes/htmlText.js';
import { startBackgroundRestore } from '../backgroundService/newBackgroundService';

/* ---------------------------------- */
/* Constants                           */
/* ---------------------------------- */

export const DRIVE_MAIN_FOLDER_NAME = 'AppBackups';

const TABLE_ORDER = [
  'categories',
  'notebooks',
  'items',
  'youtube_meta',
  'shared_drive_copies',
  'category_items',
  'notes',
  'video_watch_history',
  'images',
];

/* ---------------------------------- */
/* AsyncStorage keys                   */
/* ---------------------------------- */

const restoreKey = userId => `restoreCheckCompleted_${userId}`;
const restoreLockKey = userId => `restoreInProgress_${userId}`;
const restoreProgressKey = userId => `restoreProgress_${userId}`;
const restoreBackupsKey = userId => `restorePendingBackups_${userId}`;

/* ---------------------------------- */
/* Restore state helpers               */
/* ---------------------------------- */

export async function hasRestoreCheckCompleted(userId) {
  console.log('[Restore] Checking restore completed for:', userId);
  const res = (await AsyncStorage.getItem(restoreKey(userId))) === 'true';
  console.log('[Restore] Restore completed:', res);
  return res;
}

export async function markRestoreCheckCompleted(userId) {
  console.log('[Restore] Marking restore completed for:', userId);
  await AsyncStorage.setItem(restoreKey(userId), 'true');
  await AsyncStorage.removeItem(restoreProgressKey(userId));
  await AsyncStorage.removeItem(restoreBackupsKey(userId));

  await useBackupStore
    .getState()
    .setNativePreference('LAST_NATIVE_BACKUP_TIME_' + userId, formatDateTime());
}

async function acquireRestoreLock(userId) {
  console.log('[Restore] Acquiring lock for:', userId);
  const locked = await AsyncStorage.getItem(restoreLockKey(userId));

  if (locked === 'true') {
    console.error('[Restore] Lock is already acquired!');
    return false; // Another restore is in progress, don't start a new one
  }

  await AsyncStorage.setItem(restoreLockKey(userId), 'true');
  console.log('[Restore] Lock acquired');
  return true;
}

async function releaseRestoreLock(userId) {
  console.log('[Restore] Releasing lock for:', userId);
  await AsyncStorage.removeItem(restoreLockKey(userId));
}

export async function isRestoreInProgress(userId) {
  return (await AsyncStorage.getItem(restoreLockKey(userId))) === 'true';
}

export async function saveRestoreProgress(userId, progress) {
  await AsyncStorage.setItem(
    restoreProgressKey(userId),
    JSON.stringify(progress),
  );
}

export async function loadRestoreProgress(userId) {
  const raw = await AsyncStorage.getItem(restoreProgressKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function savePendingBackups(userId, backups) {
  await AsyncStorage.setItem(
    restoreBackupsKey(userId),
    JSON.stringify(backups),
  );
}

export async function loadPendingBackups(userId) {
  const raw = await AsyncStorage.getItem(restoreBackupsKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/* ---------------------------------- */
/* Insert helpers                      */
/* ---------------------------------- */

const TABLES_WITH_UPDATED_AT = new Set([
  'items',
  'youtube_meta',
  'notebooks',
  'categories',
  'category_items',
  'notes',
  'images',
  'shared_drive_copies',
]);

// A backup written before updated_at existed has no such column, so the insert
// omits it and the column DEFAULT (CURRENT_TIMESTAMP) stamps every restored row
// with the *restore* time. That is actively destructive: runCompaction
// re-snapshots an old range by re-querying the live DB on updated_at, so after
// a restore every historical range reads as empty — compaction then writes no
// replacement file and deletes/ghosts the originals, erasing that history from
// Drive. Carrying created_at forward as updated_at keeps rows in the range they
// actually belong to. (video_watch_history is excluded — it has no updated_at
// and is ranged on lastWatchedAt instead.)
const withPreservedUpdatedAt = (table, row) => {
  if (!TABLES_WITH_UPDATED_AT.has(table)) return row;
  if (row.updated_at != null && row.updated_at !== '') return row;
  if (row.created_at == null || row.created_at === '') return row;
  return {...row, updated_at: row.created_at};
};

// Every table here is upserted rather than INSERT OR REPLACE'd. REPLACE
// resolves a key conflict by DELETING the existing row first, and that delete
// fires ON DELETE CASCADE — items.parent_id, youtube_meta.item_id and
// category_items.category_id all cascade. Since a soft-delete now touches a
// whole item subtree at once (softDeleteItem updates every descendant), a
// parent and its children land in the same backup file, and replaying it with
// REPLACE would delete children that were just inserted, then fail the
// deferred FK check at COMMIT (error 787). An upsert never deletes, so no
// cascade fires and rows are updated in place.
//
// notes is exempt: it is an FTS5 virtual table (SQLite does not support UPSERT
// on virtual tables) but it carries no foreign keys and nothing references it,
// so REPLACE is harmless there.
const insertData = (data, label, tx) => {
  for (const table of TABLE_ORDER) {
    if (!Array.isArray(data[table])) continue;

    for (const rawRow of data[table]) {
      const row = withPreservedUpdatedAt(table, rawRow);

      if (table === 'notes' && row.rowid != null) {
        const {rowid, ...rest} = row;
        // Backups written before entity decoding carry raw "&nbsp;" in
        // text_content. notes IS the FTS5 index, so normalising on the way in
        // keeps both the list preview and search clean.
        if (typeof rest.text_content === 'string') {
          rest.text_content = decodeHtmlEntities(rest.text_content);
        }
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

      const cols = Object.keys(row);
      const vals = Object.values(row);
      const qs = cols.map(() => '?').join(',');

      // Rows without an id can't be matched for the DO UPDATE half; fall back
      // to a plain insert that simply skips anything already present.
      const updatable = cols.filter(c => c !== 'id');

      // Only overwrite when the incoming row is genuinely newer. Replaying a
      // row at its existing updated_at would otherwise still count as an
      // UPDATE, and the updated_at trigger — which only stands down when the
      // statement changes updated_at — would fire and restamp it with the
      // restore time, silently undoing withPreservedUpdatedAt. It also makes
      // restore idempotent, so a resumed or re-listed file is harmless.
      const freshnessGuard =
        TABLES_WITH_UPDATED_AT.has(table) && cols.includes('updated_at')
          ? ` WHERE ${table}.updated_at IS NULL
               OR excluded.updated_at > ${table}.updated_at`
          : '';

      const conflictAction =
        row.id != null && updatable.length
          ? `ON CONFLICT(id) DO UPDATE SET ${updatable
              .map(c => `${c} = excluded.${c}`)
              .join(', ')}${freshnessGuard}`
          : 'ON CONFLICT DO NOTHING';

      tx.executeSql(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${qs}) ${conflictAction}`,
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

// A backup file can legitimately contain a row whose FK parent is absent from
// every backup — e.g. a category_items link whose category was created in a
// window no surviving backup file covers. Foreign keys are deferred to COMMIT,
// so a single such orphan fails the whole transaction (error 787) and aborts
// the entire restore, losing everything else in the file. This runs after the
// inserts, names each offender in the log, and drops just those rows so the
// rest of the restore survives.
const reconcileForeignKeys = (tx, label) => {
  tx.executeSql(
    'PRAGMA foreign_key_check',
    [],
    (_, {rows}) => {
      for (let i = 0; i < rows.length; i++) {
        const violation = rows.item(i);
        // PRAGMA foreign_key_check columns: table, rowid, parent, fkid
        const table = violation.table;
        const rowid = violation.rowid;

        console.warn(
          `[Restore] Orphan row dropped: ${label} → ${table} rowid=${rowid} ` +
            `(no matching parent in ${violation.parent})`,
        );

        if (!table || rowid == null) continue;

        tx.executeSql(
          `DELETE FROM ${table} WHERE rowid = ?`,
          [rowid],
          () => {},
          (__, err) => {
            console.error(`[Restore] Failed dropping orphan in ${table}:`, err);
            return true;
          },
        );
      }
    },
    (_, err) => {
      console.error('[Restore] foreign_key_check failed:', err);
      return true;
    },
  );
};

const upsertBackupFileEntry = (tx, fileName, driveId) => {
  if (fileName.startsWith('img_')) return;

  const meta = extractEpochs(fileName);
  if (meta.level == null || meta.start == null || meta.end == null) return;

  tx.executeSql(
    `INSERT OR REPLACE INTO backup_files (file, level, start_epoch, end_epoch, state, drive_id)
     VALUES (?, ?, ?, ?, 'synced', ?)`,
    [fileName, meta.level, meta.start, meta.end, driveId],
    () => {},
    (_, err) => {
      console.error('[Restore] backup_files error:', err);
      return true;
    },
  );
};

/* ---------------------------------- */
/* Utilities                           */
/* ---------------------------------- */

const parseTimestampFromName = name => {
  const match = name.match(/_(\d+)-(\d+)\.json$/);
  const ts = match ? Number(match[2]) : null;
  console.log('[Restore] Parsed timestamp from', name, '→', ts);
  return ts;
};

export const formatDateTime = (date = new Date()) =>
  date.toISOString().replace('T', ' ').substring(0, 19);

/* ---------------------------------- */
/* Drive listing                       */
/* ---------------------------------- */

export async function getOrCreateDriveFolder(folderName, parentId = 'root') {
  try {
    const accessToken = await getGoogleAccessToken();
    const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`;

    const response = await RNFetchBlob.fetch(
      'GET',
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
      {Authorization: `Bearer ${accessToken}`},
    );

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
  const all = [];
  const rootFolderId = await getOrCreateDriveFolder(DRIVE_MAIN_FOLDER_NAME);
  console.log('[Restore] Root folder ID:', rootFolderId);

  const rootRes = await RNFetchBlob.fetch(
    'GET',
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `'${rootFolderId}' in parents and trashed=false`,
    )}&fields=files(id,name,mimeType,size)`,
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
      )}&fields=files(id,name,size)`,
      {Authorization: `Bearer ${accessToken}`},
    );
    imageFiles = imgRes.json().files || [];
    console.log('[Restore] Image files:', imageFiles.length);
  }

  for (const f of [...rootFiles, ...imageFiles]) {
    if (!f.name.endsWith('.json')) continue;
    const ts = parseTimestampFromName(f.name);
    if (!ts) continue;

    console.log('[Restore] Valid backup file:', f.name);

    all.push({
      id: f.id,
      name: f.name,
      timestamp: ts,
      size: Number(f.size) || 0,
    });
  }

  return all;
}

/* ---------------------------------- */
/* Download with continuous progress   */
/* ---------------------------------- */

/**
 * Downloads a single backup file and reports byte-level progress continuously.
 * Uses RNFetchBlob's progress callback which fires every chunk.
 */
async function downloadBackup(fileId, expectedBytes, onChunk) {
  const accessToken = await getGoogleAccessToken();

  return new Promise((resolve, reject) => {
    let lastReportedBytes = 0;
    let responseText = '';

    RNFetchBlob.config({
      fileCache: false,
      timeout: 60000, // 60 second timeout
    })
      .fetch(
        'GET',
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          Authorization: `Bearer ${accessToken}`,
          'Cache-Control': 'no-cache',
        },
      )
      // This fires on every chunk received - gives us continuous progress
      .progress((received, total) => {
        // total from headers - sometimes -1 if unknown
        let denominator = total > 0 ? total : expectedBytes;

        // Call onChunk for every chunk (more frequent updates)
        if (onChunk && typeof onChunk === 'function' && denominator > 0) {
          onChunk(received, denominator);
        }
      })
      .then(res => {
        if (res.info().status >= 400) {
          reject(
            new Error(`HTTP ${res.info().status}: Failed to download backup`),
          );
          return;
        }

        // Get the response as string
        responseText = res.text();

        try {
          const data = JSON.parse(responseText);
          // Calculate actual bytes using string length (works in React Native)
          const actualBytes = responseText.length;
          resolve({data, actualBytes});
        } catch (e) {
          console.error('[DOWNLOAD] JSON parse error:', e);
          console.error(
            '[DOWNLOAD] First 500 chars of response:',
            responseText.substring(0, 500),
          );
          reject(new Error('Failed to parse backup JSON: ' + e.message));
        }
      })
      .catch(err => {
        console.error('[DOWNLOAD] Network error:', err);
        reject(new Error('Network error during download: ' + err.message));
      });
  });
}

/* ---------------------------------- */
/* Public entry point (resume-aware)   */
/* ---------------------------------- */
// If an interrupted restore is detected, auto-resumes immediately.

// Check and handle restore flow (prompt user)
export const checkAndPromptRestore = async (userInfo, navigateToMain) => {
  const {setCheckingAvailableBackup} = useRestoreStore.getState();
  const {updateProgress, startRestore} = useRestoreStore.getState();
  useRestoreStore.getState().setOnComplete(async () => {
  await navigateToMain(userInfo);
});
  const userId = userInfo.user.id;
  const alreadyChecked = await hasRestoreCheckCompleted(userId);

  if (alreadyChecked) {
    await navigateToMain(userInfo);
    return false;
  }

  setCheckingAvailableBackup(true);

  try {
    // Check for interrupted restore first
    const inProgress = await isRestoreInProgress(userId);
    const savedBackups = await loadPendingBackups(userId);

    if (inProgress && savedBackups) {
      // Auto-resume interrupted restore
      const savedProgress = await loadRestoreProgress(userId);
      startRestore();
      if (savedProgress?.totalBytes > 0) {
        const pct = Math.min(
          Math.round(
            (savedProgress.downloadedBytes / savedProgress.totalBytes) * 100,
          ),
          99,
        );
        updateProgress(pct);
      }
      // await attemptRestore(userInfo, savedBackups);
      await startBackgroundRestore(userInfo, savedBackups);
      return true;
    }

    // Fresh backup check
    const backups = await listAllDriveBackups();
    setCheckingAvailableBackup(false);

    if (!backups.length) {
      await markRestoreCheckCompleted(userId);
      await navigateToMain(userInfo);
      return false;
    }

    // Show restore prompt
    return new Promise(resolve => {
      Alert.alert(
        'Backup Found',
        'A backup was found for your account. Would you like to restore it now?',
        [
          {
            text: 'Skip',
            style: 'cancel',
            onPress: async () => {
              await markRestoreCheckCompleted(userId);
              await navigateToMain(userInfo);
              resolve(false);
            },
          },
          {
            text: 'Restore',
            onPress: async () => {
              resolve(true);
              startRestore();
              try {
                // await attemptRestore(userInfo, backups);
                await startBackgroundRestore(userInfo, backups);
              } catch (e) {
                console.error('[Restore] Failed:', e);
                Alert.alert(
                  'Restore Failed',
                  'Something went wrong. Your progress is saved — reopen the app to retry.',
                  [{text: 'OK'}],
                );
              }
            },
          },
        ],
        {cancelable: false},
      );
    });
  } catch (e) {
    console.error('[Restore] Fatal error', e);
    Alert.alert(
      'Restore Error',
      'Could not check for backups. Please try again.',
      [{text: 'OK'}],
    );
    return false;
  } finally {
    setCheckingAvailableBackup(false);
  }
};

export async function attemptRestore(userInfo, backups, onProgress=null) {
  const userId = userInfo.user.id;
  const {setRestoreError} = useRestoreStore.getState();
  const alreadyLocked = await isRestoreInProgress(userId);
  if (!alreadyLocked) {
    await acquireRestoreLock(userId);
    await savePendingBackups(userId, backups);
  }

  await savePendingBackups(userId, backups);
  try {
    await runRestore(userId, backups, onProgress);
    await markRestoreCheckCompleted(userId);
    await releaseRestoreLock(userId);

  } catch (error) {
    console.error('[RestoreStore] Restore failed:', error);
    setRestoreError(error.message);
    throw error;
  }
}

async function runRestore(userId, backups, onProgress=null) {
  const db = getDb();
  try {
    const savedProgress = await loadRestoreProgress(userId);
    const completedFiles = savedProgress?.completedFiles ?? [];

    const dbBackups = backups.filter(b => b.name && b.name.startsWith('L'));
    const imageBackups = backups.filter(
      b => b.name && b.name.startsWith('img_'),
    );

    dbBackups.sort((a, b) => a.timestamp - b.timestamp);
    imageBackups.sort((a, b) => a.timestamp - b.timestamp);

    const allBackups = [...dbBackups, ...imageBackups];
    const validBackups = allBackups.filter(b => b.id && b.size > 0);

    if (validBackups.length === 0) {
      console.warn('[Restore] No valid backups found');
      if (onProgress) onProgress(100);
      return;
    }

    const totalBytes = validBackups.reduce((sum, b) => sum + (b.size || 0), 0);
    const priorBytes = validBackups
      .filter(b => completedFiles.includes(b.name))
      .reduce((sum, b) => sum + (b.size || 0), 0);

    // let downloadedBytes = priorBytes;
    let downloadedBytes = savedProgress?.downloadedBytes ?? priorBytes;
    let lastReportedPercent = 0;
    let lastEmitTime = 0;

    const emitProgress = () => {
      if (!onProgress || totalBytes === 0) return;
      const now = Date.now();
      if (now - lastEmitTime < 50 && lastReportedPercent < 99) return;
      lastEmitTime = now;
      const pct = Math.min(
        Math.floor((downloadedBytes / totalBytes) * 100),
        99,
      );
      if (pct !== lastReportedPercent) {
        lastReportedPercent = pct;
        onProgress(pct);
        console.log(
          `[Restore] Progress: ${pct}% (${downloadedBytes}/${totalBytes} bytes)`,
        );
      }
    };

    emitProgress();

    // ── helper: commit a single backup file to DB immediately ──────────────
    const commitFileToDB = (name, data, driveId) =>
      new Promise((resolve, reject) => {
        db.transaction(
          tx => {
            tx.executeSql('PRAGMA defer_foreign_keys = ON');
            insertData(data, name, tx);
            reconcileForeignKeys(tx, name);
            if (driveId) {
              upsertBackupFileEntry(tx, name, driveId);
            }
          },
          err => {
            console.error('[Restore] DB commit failed for:', name, err);
            reject(err);
          },
          () => {
            console.log('[Restore] DB committed:', name);
            resolve();
          },
        );
      });

    // ── download helper (unchanged) ────────────────────────────────────────
    const downloadWithProgress = async backup => {
      if (completedFiles.includes(backup.name)) {
        console.log('[Restore] Skipping already completed file:', backup.name);
        return null;
      }
      let fileDownloadedBytes = 0;
      const result = await downloadBackup(backup.id, backup.size, received => {
        const delta = received - fileDownloadedBytes;
        if (delta > 0) {
          fileDownloadedBytes = received;
          downloadedBytes += delta;
          emitProgress();
        }
      });

      // snap to exact file size after download completes
      // last progress event often doesn't cover final bytes
      const remaining = backup.size - fileDownloadedBytes;
      if (remaining > 0) {
        downloadedBytes += remaining;
        emitProgress();
      }
      return result;
    };

    // ── DB backups: download → commit → checkpoint each file ──────────────
    for (const backup of dbBackups) {
      if (completedFiles.includes(backup.name)) continue;

      const result = await downloadWithProgress(backup);
      if (!result?.data) continue;

      console.log('[Restore] Download complete:', backup.name);

      await commitFileToDB(backup.name, result.data, backup.id);

      // mark complete only after DB write confirmed
      completedFiles.push(backup.name);
      await saveRestoreProgress(userId, {
        completedFiles: [...completedFiles],
        totalBytes,
        downloadedBytes,
      });

      console.log('[Restore] Checkpointed:', backup.name);
    }

    // ── image backups: same pattern ────────────────────────────────────────
    for (const backup of imageBackups) {
      if (completedFiles.includes(backup.name)) continue;

      const result = await downloadWithProgress(backup);
      if (!result?.data) continue;

      console.log('[Restore] Download complete:', backup.name);

      await commitFileToDB(backup.name, result.data, null);

      completedFiles.push(backup.name);
      await saveRestoreProgress(userId, {
        completedFiles: [...completedFiles],
        totalBytes,
        downloadedBytes,
      });

      console.log('[Restore] Checkpointed:', backup.name);
    }

    // ── FTS rebuild once at the end (not per file) ─────────────────────────
    await new Promise((resolve, reject) => {
      db.transaction(
        tx => {
          // notes is an FTS5 virtual table, whose columns cannot carry a
          // DEFAULT — a backup written before updated_at existed omits that
          // column, so those rows restore with updated_at NULL instead of a
          // timestamp. The native backup range query (updated_at >= ? AND
          // < ?) never matches NULL, so without this backfill a restored
          // note would never be backed up again until it was next edited.
          tx.executeSql(
            `UPDATE notes
             SET updated_at = COALESCE(NULLIF(created_at, ''), CURRENT_TIMESTAMP)
             WHERE updated_at IS NULL OR updated_at = ''`,
            [],
            () => {},
            (_, err) => {
              console.error('[Restore] notes.updated_at backfill failed:', err);
              return true;
            },
          );

          tx.executeSql(
            `INSERT INTO notes(notes) VALUES('rebuild')`,
            [],
            () => {},
            (_, err) => {
              console.error('[Restore] FTS rebuild failed:', err);
              return true;
            },
          );
        },
        err => reject(err),
        () => resolve(),
      );
    });

    if (onProgress) onProgress(100);
  } catch (error) {
    console.error('[Restore] runRestore failed:', error);
    throw error;
  }
}
