import {unzip} from 'react-native-zip-archive'; // Install: npm install react-native-zip-archive
import useDbStore from '../database/dbStore';
import RNFetchBlob from 'rn-fetch-blob';
import {downloadBackupFromDrive} from './googleDriveRestoreUtils';
import {getDb} from '../database/database';
import SQLite from 'react-native-sqlite-2';

/**
 * Restores a full backup (ZIP file)
 * @param {string} backupId - Google Drive file ID
 * @returns {Promise<boolean>} - True if successful
 */
export const restoreFullBackupOld = async backupId => {
  try {
    console.log(`Starting full backup restore for backupId: ${backupId}`);

    // 1. Download ZIP
    const zipPath = `${RNFetchBlob.fs.dirs.CacheDir}/restore_temp.zip`;
    console.log(`Downloading backup to: ${zipPath}`);
    const downloadedPath = await downloadBackupFromDrive(backupId, zipPath);
    console.log(`Downloaded backup ZIP to: ${downloadedPath}`);

    // 2. Unzip to temporary location
    const unzipPath = `${RNFetchBlob.fs.dirs.DocumentDir}/db_restore_${Date.now()}`;
    console.log(`Unzipping backup ZIP to: ${unzipPath}`);
    await unzip(downloadedPath, unzipPath);
    console.log(`Unzip complete`);
    const contents = await RNFetchBlob.fs.ls(unzipPath);
    console.log('Contents of unzipPath:', contents);

    // 3. Verify database exists in ZIP
    const userId = useDbStore.getState().currentUserId;
    const dbName = `DriveApp_${userId}.db`;
    const restoredDbPath = `${unzipPath}/DriveApp_${userId}.db`;
    console.log(`Checking for existence of restored DB at: ${restoredDbPath}`);
    const exists = await RNFetchBlob.fs.exists(restoredDbPath);
    if (!exists) {
      console.error('Backup ZIP missing database file');
      throw new Error('Backup ZIP missing database file');
    }
    console.log(`Database file verified: ${restoredDbPath}`);

    console.log('Closing current database...');
    useDbStore.getState().setDb(null);

    // 4. Replace current DB (atomic operation)
    const currentDbPath = useDbStore.getState().dbPath;
    console.log(`Replacing current DB at: ${currentDbPath}`);
    await RNFetchBlob.fs.mv(restoredDbPath, currentDbPath);
    console.log(`Database replaced successfully`);

    // 5. Cleanup
    console.log(`Cleaning up: Deleting ZIP and temp folder`);
    await RNFetchBlob.fs.unlink(downloadedPath);
    await RNFetchBlob.fs.unlink(unzipPath);
    console.log(`Cleanup complete.`);
    return dbName;
  } catch (error) {
    console.error(`Error restoring backup: ${error.message}`, error);
    throw error;
  }
};

/**
 * Restores a full backup (JSON file)
 * @param {string} backupId - Google Drive file ID
 * @returns {Promise<boolean>} - True if successful
 */
export const restoreFullBackup = async (backupId) => {
  try {
    console.log(`Starting full backup restore for backupId: ${backupId}`);

    // 1. Download JSON
    const jsonPath = `${RNFetchBlob.fs.dirs.CacheDir}/full_restore_temp.json`;
    console.log(`Downloading backup to: ${jsonPath}`);
    const downloadedPath = await downloadBackupFromDrive(backupId, jsonPath);
    console.log(`Downloaded backup JSON to: ${downloadedPath}`);

    // 2. Read changes
    console.log(`Reading JSON data from: ${downloadedPath}`);
    const changesData = await RNFetchBlob.fs.readFile(downloadedPath, 'utf8');
    const changes = JSON.parse(changesData);
    console.log(`Parsed changes for tables: ${Object.keys(changes).join(', ')}`);

    // 3. Apply to database, handling schema differences
    const db = getDb();
    console.log(`Applying changes to database...`);
    await db.transaction(async (tx) => {
      for (const [table, rows] of Object.entries(changes)) {
        console.log(`Applying changes to table: ${table} with ${rows.length} row(s)`);
        if (rows.length === 0) continue;

        // Get current columns for the table
        const currentColumns = await getTableColumns(table);

        for (const row of rows) {
          // Filter row to only include current columns
          const filteredRow = {};
          currentColumns.forEach(col => {
            if (row.hasOwnProperty(col)) {
              filteredRow[col] = row[col];
            }
          });

          const columns = Object.keys(filteredRow);
          if (columns.length === 0) continue;

          const placeholders = columns.map(() => '?').join(',');
          const values = columns.map(key => filteredRow[key]);
          const columnList = columns.join(',');

          await tx.executeSql(
            `INSERT OR REPLACE INTO ${table} (${columnList}) VALUES (${placeholders})`,
            values
          );
        }
      }
    });
    console.log(`All changes applied successfully`);

    // 4. Cleanup
    console.log(`Cleaning up temporary JSON file: ${downloadedPath}`);
    await RNFetchBlob.fs.unlink(downloadedPath);
    console.log(`Cleanup complete. Full restore finished successfully`);

    return true;
  } catch (error) {
    console.error(`Error restoring full backup: ${error.message}`, error);
    throw error;
  }
};

export function reinitializeDatabase(dbName) {
  console.log('Reinitializing database...');
  const db = SQLite.openDatabase({name: dbName, location: 'default'});
  useDbStore.getState().setDb(db);
  console.log('Database initialised successfully');
}
/**
 * Applies incremental changes to the database
 * @param {string} backupId - Google Drive file ID
 * @returns {Promise<boolean>} - True if successful
 */
export const restoreIncrementalBackup = async backupId => {
  try {
    console.log(
      `Starting incremental backup restore for backupId: ${backupId}`,
    );

    const tempJsonPath = `${RNFetchBlob.fs.dirs.CacheDir}/changes.json`;
    console.log(`Downloading incremental JSON to: ${tempJsonPath}`);

    // 1. Download JSON changes
    const jsonPath = await downloadBackupFromDrive(backupId, tempJsonPath);
    console.log(`Downloaded incremental changes to: ${jsonPath}`);

    // 2. Read changes
    console.log(`Reading JSON data from: ${jsonPath}`);
    const changesData = await RNFetchBlob.fs.readFile(jsonPath, 'utf8');
    const changes = JSON.parse(changesData);
    console.log(
      `Parsed changes for tables: ${Object.keys(changes).join(', ')}`,
    );

    // 3. Apply to database
    const db = getDb();
    console.log(`Applying changes to database...`);
    await db.transaction(async tx => {
      for (const [table, rows] of Object.entries(changes)) {
        console.log(
          `Applying changes to table: ${table} with ${rows.length} row(s)`,
        );
        if (rows.length === 0) continue;

        // Get current columns for the table
        const currentColumns = await getTableColumns(table);

        for (const row of rows) {
          // Filter row to only include current columns
          const filteredRow = {};
          currentColumns.forEach(col => {
            if (row.hasOwnProperty(col)) {
              filteredRow[col] = row[col];
            }
          });
          const columns = Object.keys(filteredRow);
          if (columns.length === 0) continue;

          const placeholders = columns.map(() => '?').join(',');
          const values = columns.map(key => filteredRow[key]);
          const columnList = columns.join(',');

          await tx.executeSql(
            `INSERT OR REPLACE INTO ${table} (${columnList}) VALUES (${placeholders})`,
            values,
          );
        }
      }
    });
    console.log(`All changes applied successfully`);

    // 4. Cleanup
    console.log(`Cleaning up temporary JSON file: ${jsonPath}`);
    await RNFetchBlob.fs.unlink(jsonPath);
    console.log(`Cleanup complete. Incremental restore finished successfully`);

    return true;
  } catch (error) {
    console.error(`Incremental restore failed: ${error.message}`, error);
    throw error;
  }
};

/**
 * Helper to get current columns of a table
 * @param {string} table - Table name
 * @returns {Promise<string[]>} - Array of column names
 */
const getTableColumns = table => {
  return new Promise((resolve, reject) => {
    const db = getDb();
    db.transaction(tx => {
      tx.executeSql(
        `PRAGMA table_info(${table})`,
        [],
        (_, {rows}) => {
          const columns = [];
          for (let i = 0; i < rows.length; i++) {
            columns.push(rows.item(i).name);
          }
          resolve(columns);
        },
        (_, error) => {
          reject(error);
          return true;
        },
      );
    });
  });
};
