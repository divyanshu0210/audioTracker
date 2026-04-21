// BackupDbService.js

import { getDb } from "../database/database";

const TABLE = 'backup_files';

// =========================
// HELPER: convert rows safely
// =========================
const mapRows = (res) => {
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
};

// =========================
// GET FILES
// =========================
export const getLocalFiles = () => {
  const db = getDb();

  console.log('[DB] Fetching LOCAL files');

  return new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        console.log('[DB] Transaction started (LOCAL)');

        tx.executeSql(
          `SELECT file, level FROM ${TABLE} 
           WHERE state='local' 
           ORDER BY start_epoch ASC`,
          [],
          (_, res) => {
            const rows = mapRows(res);
            console.log(`[DB] LOCAL files fetched: ${rows.length}`);
            resolve(rows);
          },
          (_, err) => {
            console.error('[DB] SQL error (LOCAL):', err);
            reject(err);
            return true;
          },
        );
      },
      error => {
        console.error('[DB] Transaction error (LOCAL):', error);
        reject(error);
      },
      () => {
        console.log('[DB] Transaction success (LOCAL)');
      },
    );
  });
};

export const getGhostFiles = () => {
  const db = getDb();

  console.log('[DB] Fetching GHOST files');

  return new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        console.log('[DB] Transaction started (GHOST)');

        tx.executeSql(
          `SELECT file, drive_id FROM ${TABLE} WHERE state='ghost'`,
          [],
          (_, res) => {
            const rows = mapRows(res);
            console.log(`[DB] GHOST files fetched: ${rows.length}`);
            resolve(rows);
          },
          (_, err) => {
            console.error('[DB] SQL error (GHOST):', err);
            reject(err);
            return true;
          },
        );
      },
      error => {
        console.error('[DB] Transaction error (GHOST):', error);
        reject(error);
      },
      () => {
        console.log('[DB] Transaction success (GHOST)');
      },
    );
  });
};

export const getAllDbFiles = async () => {
  const db = getDb();

  console.log('[EXPLORER] Fetching DB files');

  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT file, level, state, drive_id FROM backup_files`,
        [],
        (_, res) => {
          const rows = [];

          for (let i = 0; i < res.rows.length; i++) {
            rows.push(res.rows.item(i));
          }

          console.log(`[EXPLORER] DB files: ${rows.length}`);
          resolve(rows);
        },
        (_, err) => {
          console.error('[EXPLORER] DB error:', err);
          reject(err);
        },
      );
    });
  });
};

// =========================
// UPDATE STATE
// =========================
export const updateState = (file, state, driveId = null) => {
  const db = getDb();

  console.log(`[DB] Updating state → file: ${file}, state: ${state}, driveId: ${driveId}`);

  return new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        tx.executeSql(
          `UPDATE ${TABLE} 
           SET state=?, drive_id=COALESCE(?, drive_id) 
           WHERE file=?`,
          [state, driveId, file],
          (_, res) => {
            console.log(`[DB] State updated → ${file}, rowsAffected: ${res.rowsAffected}`);
            resolve();
          },
          (_, err) => {
            console.error(`[DB] SQL error updating ${file}:`, err);
            reject(err);
            return true;
          },
        );
      },
      error => {
        console.error('[DB] Transaction error (UPDATE):', error);
        reject(error);
      },
    );
  });
};

// =========================
// DELETE FILE ENTRY
// =========================
export const deleteFile = (file) => {
  const db = getDb();

  console.log(`[DB] Deleting file entry → ${file}`);

  return new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        tx.executeSql(
          `DELETE FROM ${TABLE} WHERE file=?`,
          [file],
          (_, res) => {
            console.log(`[DB] File deleted → ${file}, rowsAffected: ${res.rowsAffected}`);
            resolve();
          },
          (_, err) => {
            console.error(`[DB] SQL error deleting ${file}:`, err);
            reject(err);
            return true;
          },
        );
      },
      error => {
        console.error('[DB] Transaction error (DELETE):', error);
        reject(error);
      },
    );
  });
};