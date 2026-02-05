import {zip, unzip} from 'react-native-zip-archive';
import {getDb} from '../database/database';
import {getSetting, setSetting} from '../database/settings';
import useSettingsStore from '../Settings/settingsStore';
import {getUserDatabase} from '../database/UserDatabaseInstance';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const compressDatabase = async (dbPath, backupFolder) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipPath = `${backupFolder}/backup_${timestamp}.zip`;

  console.log(`Compressing DB from ${dbPath} to ${zipPath}...`);
  await zip(dbPath, zipPath);
  console.log('Compression complete.');
  return zipPath;
};

export const getLastBackupTimestamp = async () => {
  try {
    const timestamp = await getSetting('LAST_BACKUP_TIME');

    if (!timestamp) return null;

    // If timestamp is a valid date string, return a Date object or the string
    // const parsedDate = new Date(timestamp);
    // if (isNaN(parsedDate.getTime())) {
    //   console.warn('Invalid LAST_BACKUP_TIME format in DB:', timestamp);
    //   return null;
    // }

    return timestamp; // or return timestamp if you want the raw string
    // return parsedDate.toISOString(); // or return timestamp if you want the raw string
  } catch (error) {
    console.error('Failed to get LAST_BACKUP_TIME:', error);
    return null;
  }
};

export const saveBackupTimestamp = async () => {
  try {
    const userId = await AsyncStorage.getItem('userId');
    if (!userId) {
      console.error('User ID not found in AsyncStorage');
      throw new Error('User not logged in');
    }

    const nowUTC = new Date().toISOString().slice(0, 19).replace('T', ' '); // "YYYY-MM-DD HH:MM:SS"
    const nowLocal = new Date().toLocaleString();

    const timestampData = {
      LAST_BACKUP_TIME: nowUTC,
      LAST_BACKUP_LOCAL_TIME: nowLocal,
    };
    await AsyncStorage.setItem(
      `BACKUP_TIMESTAMP_${userId}`,
      JSON.stringify(timestampData),
    );

    // --------------------------
    await useSettingsStore.getState().updateSettings(timestampData);

    console.log(`🔒 Backup timestamp saved for user ${userId}:`, timestampData);
  } catch (error) {
    console.error('Failed to save backup timestamp:', error);
  }
};

export const prepareIncrementalBackup = async (lastBackupTime, tables = null)=> {
  try {
    const db = getUserDatabase().getDb() || getDb();
    const changes = {};
    const effectiveBackupTime = lastBackupTime || '1970-01-01 00:00:00';
    console.log('Preparing incremental backup since', lastBackupTime);

     const defaultTables = tables||[
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
      // , 'images'
      // Add any other tables here 
    ];
    const fetchTableChanges = table => {
      return new Promise(resolve => {
        db.transaction(
          tx => {
            let query;
            let params = [effectiveBackupTime];

            if (table === 'notes') {
              query = `SELECT rowid, * FROM ${table} WHERE created_at > ?`;
            }
            else if (table === 'video_watch_history') {
              query = `SELECT * FROM ${table} WHERE lastWatchedAt > ?`; 
              // Use lastWatchedAt for videos to capture any re-watches or progress updates, not just new entries
              // query = `SELECT * FROM ${table} WHERE date >= DATE(?)`; // Only compare date part
            } else {
              query = `SELECT * FROM ${table} WHERE created_at > ?`; // Default strict compare with timestamp
            }

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

                console.log(`Fetched ${rows.length} rows from ${table}`);
                resolve({table, rows});
              },
              (_, error) => {
                console.error(`Error querying table ${table}:`, error);
                resolve({table, rows: []});
                return true;
              },
            );
          },
          error => {
            console.error(`Transaction error for table ${table}:`, error);
            resolve({table, rows: []});
          },
        );
      });
    };

    const results = await Promise.all(defaultTables.map(fetchTableChanges));

    for (const {table, rows} of results) {
      changes[table] = rows;
    }

    console.log('Incremental changes collected for all tables:', changes);
    return changes;
  } catch (error) {
    console.error('Error in prepareIncrementalBackup:', error);
    throw error;
  }
};

// New function: Export all data to JSON (for full backups)
export const exportDatabaseToJson = async () => {
  try {
    const db = getUserDatabase().getDb() || getDb();
    const data = {};
    console.log('Exporting full database to JSON...');

    const tables = [
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
      // , 'images'
      // Add any other tables here
    ];

    const fetchTableData = table => {
      return new Promise(resolve => {
        db.transaction(tx => {
          let query = `SELECT * FROM ${table}`;
          if (table === 'notes') {
            query = `SELECT rowid, * FROM ${table}`;
          }
          tx.executeSql(
           query,
            [],
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

    const results = await Promise.all(tables.map(fetchTableData));

    for (const {table, rows} of results) {
      data[table] = rows;
    }

    console.log('Full data export collected:', Object.keys(data));
    return data;
  } catch (error) {
    console.error('Error in exportDatabaseToJson:', error);
    throw error;
  }
};


const checkGoogleDriveStorage = async () => {
  try {
    const { accessToken } = await GoogleSignin.getTokens();
    const response = await RNFetchBlob.fetch(
      'GET',
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
      { 'Authorization': `Bearer ${accessToken}` }
    );
    const { storageQuota } = response.json();
    if (storageQuota.used / storageQuota.limit > 0.8) {
      console.warn('Google Drive storage nearing limit:', storageQuota);
      // Notify user via UI
    }
  } catch (error) {
    console.error('Error checking Google Drive storage:', error);
  }
};

