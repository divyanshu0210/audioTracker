// import {Alert} from 'react-native';
// import {listAvailableBackups} from './googleDriveRestoreUtils';
// import {reinitializeDatabase, restoreFullBackup, restoreIncrementalBackup} from './restoreUtils';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import useDbStore from '../database/dbStore';

// export async function hasRestoreCheckCompleted(userId) {
//   const key = `restoreCheckCompleted_${userId}`;
//   const value = await AsyncStorage.getItem(key);
//   return value === 'true';
// }

// export async function markRestoreCheckCompleted(userId) {
//   const key = `restoreCheckCompleted_${userId}`;
//   await AsyncStorage.setItem(key, 'true');
// }

// export async function checkAndPromptRestore() {
//   const currentUserId = useDbStore.getState().currentUserId;
//   try {
//     const backups = await listAvailableBackups();

//     if (backups.length === 0) {
//       throw new Error('No backups found in Google Drive');
//     }

//     // 2. Find the latest full backup
//     const fullBackups = backups.filter(b => b.type === 'full');
//     if (fullBackups.length === 0) {
//       //   throw new Error('No full backup available');
//       console.log('No backup found');
//       Alert.alert('No backup file found');
//       await markRestoreCheckCompleted(currentUserId);
//       return;
//     }

//     const latestFullBackup = fullBackups[0];
//     console.log('Latest full backup:', latestFullBackup.name);

//     Alert.alert(
//       'Backup Found',
//       `Found backup(s) for your account. Do you want to restore the latest one?`,
//       // `Found ${backups.length} backup(s) for your account. Do you want to restore the latest one?`,
//       [
//         {
//           text: 'Skip',
//           onPress: async () => {
//             console.log('User skipped restore');
//             await markRestoreCheckCompleted(currentUserId);
//           },
//           style: 'cancel',
//         },
//         {
//           text: 'Restore',
//           onPress: async () => {
//             console.log('Starting restore process...');
//             try {
//               const result = await completeRestore(latestFullBackup, backups);
//               if (result.success) {
//                 Alert.alert(
//                   'Restore Complete',
//                   `Successfully restored:
//                                     - Full backup: ${result.restored.full.name}
//                                     - ${result.restored.incrementals.length} incremental backups
//                                     - ${result.restored.imagesIncrementals.length} images incremental backups`,
//                   // Alert.alert('Success', 'Your backup was restored successfully.');
//                 );
//               } else {
//                 Alert.alert(
//                   'Restore Failed',
//                   result.error || 'Unknown error occurred',
//                 );
//               }
//             } catch (err) {
//               console.error('Restore failed:', err);
//               Alert.alert('Restore Failed', 'Could not restore your backup.');
//             } finally {
//               await markRestoreCheckCompleted(currentUserId);
//             }
//           },
//         },
//       ],
//       {cancelable: false},
//     );
//   } catch (err) {
//     console.error('Backup check failed:', err);
//     await markRestoreCheckCompleted(currentUserId);
//   }
// }


// const completeRestore = async (latestFullBackup, backups) => {
//   const { setRestoreInProgress} = useDbStore.getState();
//   try {
//     // 3. Restore full backup first
//     setRestoreInProgress(true)
//     // const dbName = await restoreFullBackup(latestFullBackup.id);
//     // reinitializeDatabase(dbName);
//     await restoreFullBackup(latestFullBackup.id);
//     console.log('Full DB Restore operation finished successfully');

//     // 4. Find incremental backups AFTER the full backup
//     const incrementalBackups = backups
//       .filter(
//         b =>
//           b.type === 'incremental' &&
//           new Date(b.createdTime) > new Date(latestFullBackup.createdTime),
//       )
//       .sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime)); // Oldest first

//     console.log(
//       `Found ${incrementalBackups.length} incremental backups to apply`,
//     );

//     // 5. Apply incremental backups in chronological order
//     for (const backup of incrementalBackups) {
//       console.log('Applying incremental:', backup.name);
//       await restoreIncrementalBackup(backup.id);
//     }

//     const imagesIncrementalBackups = backups
//       .filter(b => b.type === 'images_incremental')
//       .sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime)); // Oldest first

//     console.log(
//       `Found ${imagesIncrementalBackups.length} images incremental backups to apply`,
//     );

//     for (const backup of imagesIncrementalBackups) {
//       console.log('Applying images incremental:', backup.name);
//       await restoreIncrementalBackup(backup.id);
//     }

//     return {
//       success: true,
//       restored: {
//         full: latestFullBackup,
//         incrementals: incrementalBackups.map(b => b.name),
//         imagesIncrementals: imagesIncrementalBackups.map(b => b.name),
//       },
//     };
//   } catch (error) {
//     console.error('Restore failed:', error);
//     return {
//       success: false,
//       error: error.message,
//       recovered: false, // Critical for UI to show partial recovery
//     };
//   }
//   finally {
//     setRestoreInProgress(false);
//   }
// };
import { Alert } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import RNFetchBlob from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from '../database/database';
import useDbStore from '../database/dbStore';
 


// Check if restore has been completed for the user
export async function hasRestoreCheckCompleted(userId) {
  const key = `restoreCheckCompleted_${userId}`;
  const value = await AsyncStorage.getItem(key);
  return value === 'true';
}

// Mark restore check as completed
export async function markRestoreCheckCompleted(userId) {
  const key = `restoreCheckCompleted_${userId}`;
  await AsyncStorage.setItem(key, 'true');
}

// List backups from Google Drive
export const listAvailableBackups = async () => {
  try {
    const { accessToken } = await GoogleSignin.getTokens();
    
    const queries = [
      { type: 'full', query: `name contains 'full_backup_' and trashed = false` },
      { type: 'incremental', query: `name contains 'incremental_backup_' and not name contains 'images_incremental_backup_' and trashed = false` },
      { type: 'images_incremental', query: `name contains 'images_incremental_backup_' and trashed = false` },
    ];

    const backups = [];
    
    for (const { type, query } of queries) {
      const response = await RNFetchBlob.fetch(
        'GET',
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc&fields=files(id,name,createdTime)`,
        {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      );

      if (response.info().status >= 400) {
        console.error(`Failed to list ${type} backups: ${response.data}`);
        continue;
      }

      const { files } = response.json();
      backups.push(...files.map(file => ({
        id: file.id,
        name: file.name,
        type,
        createdTime: file.createdTime,
        timestamp: parseBackupTimestamp(file.name),
      })));
    }

    return backups;
  } catch (error) {
    console.error('Error listing backups:', error);
    return [];
  }
};

// Parse timestamp from backup filename
const parseBackupTimestamp = (name) => {
  const match = name.match(/_backup_(.+)\.json$/);
  return match ? match[1] : null;
};

// Download backup from Google Drive
const downloadFromDrive = async (fileId) => {
  try {
    const { accessToken } = await GoogleSignin.getTokens();

    const response = await RNFetchBlob.fetch(
      'GET',
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        'Authorization': `Bearer ${accessToken}`,
      }
    );

    if (response.info().status >= 400) {
      throw new Error(`Download failed: ${response.data}`);
    }

    return response.text();
  } catch (error) {
    console.error('Error downloading backup:', error);
    throw error;
  }
};

// Insert data into tables
const insertDataToTables = async (data) => {
  const db = getDb();
  const tableOrder = [
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
    'images'
  ];

  for (const table of tableOrder) {
    if (data[table] && data[table].length > 0) {
      await new Promise((resolve, reject) => {
        db.transaction(
          tx => {
            data[table].forEach(row => {
              const columns = Object.keys(row);
              const values = Object.values(row);
              const placeholders = columns.map(() => '?').join(',');
              const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
              
              tx.executeSql(
                sql,
                values,
                () => {},
                (_, error) => {
                  console.error(`Error inserting into ${table}:`, error);
                  return true;
                }
              );
            });
          },
          error => reject(error),
          () => {
            console.log(`Inserted data into ${table} successfully`);
            resolve();
          }
        );
      });
    }
  }
};

// Restore full backup
export const restoreFullBackup = async (fileId) => {
  try {
    const content = await downloadFromDrive(fileId);
    const data = JSON.parse(content);
    
    // await resetDatabase();
    // await initDatabase();
    
    await insertDataToTables(data);
    console.log('Full backup restored successfully');
  } catch (error) {
    console.error('Error restoring full backup:', error);
    throw error;
  }
};

// Restore incremental backup
export const restoreIncrementalBackup = async (fileId) => {
  try {
    const content = await downloadFromDrive(fileId);
    const data = JSON.parse(content);
    
    await insertDataToTables(data);
    console.log('Incremental backup restored successfully');
  } catch (error) {
    console.error('Error restoring incremental backup:', error);
    throw error;
  }
};

// Main function to check and prompt for restore
export async function checkAndPromptRestore() {
  const currentUserId = useDbStore.getState().currentUserId;
  if (!currentUserId) {
    console.error('No user ID found');
    return;
  }

  if (await hasRestoreCheckCompleted(currentUserId)) {
    console.log('Restore check already completed for user:', currentUserId);
    return;
  }

  try {
    const backups = await listAvailableBackups();

    if (backups.length === 0) {
      console.log('No backups found');
      Alert.alert('No Backup Found', 'No backup files found in Google Drive.');
      await markRestoreCheckCompleted(currentUserId);
      return;
    }

    const fullBackups = backups.filter(b => b.type === 'full');
    if (fullBackups.length === 0) {
      console.log('No full backup found');
      Alert.alert('No Backup Found', 'No full backup available to restore.');
      await markRestoreCheckCompleted(currentUserId);
      return;
    }

    const latestFullBackup = fullBackups.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))[0];
    console.log('Latest full backup:', latestFullBackup.name);

    Alert.alert(
      'Backup Found',
      `Found a backup for your account. Would you like to restore the latest one?`,
      [
        {
          text: 'Skip',
          onPress: async () => {
            console.log('User skipped restore');
            await markRestoreCheckCompleted(currentUserId);
          },
          style: 'cancel',
        },
        {
          text: 'Restore',
          onPress: async () => {
            console.log('Starting restore process...');
            try {
              const result = await completeRestore(latestFullBackup, backups);
              if (result.success) {
                Alert.alert(
                  'Restore Complete',
                  `Successfully restored:\n- Full backup: ${result.restored.full.name}\n- ${result.restored.incrementals.length} incremental backups\n- ${result.restored.imagesIncrementals.length} images incremental backups`
                );
              } else {
                Alert.alert('Restore Failed', result.error || 'An unknown error occurred.');
              }
            } catch (err) {
              console.error('Restore failed:', err);
              Alert.alert('Restore Failed', 'Could not restore your backup.');
            } finally {
              await markRestoreCheckCompleted(currentUserId);
            }
          },
        },
      ],
      { cancelable: false }
    );
  } catch (err) {
    console.error('Backup check failed:', err);
    await markRestoreCheckCompleted(currentUserId);
  }
}

// Complete the restore process
const completeRestore = async (latestFullBackup, backups) => {
  const { setRestoreInProgress } = useDbStore.getState();
  try {
    setRestoreInProgress(true);
    
    await restoreFullBackup(latestFullBackup.id);
    console.log('Full DB Restore operation finished successfully');

    const incrementalBackups = backups
      .filter(
        b =>
          b.type === 'incremental' &&
          new Date(b.createdTime) > new Date(latestFullBackup.createdTime)
      )
      .sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));

    console.log(`Found ${incrementalBackups.length} incremental backups to apply`);

    for (const backup of incrementalBackups) {
      console.log('Applying incremental:', backup.name);
      await restoreIncrementalBackup(backup.id);
    }

    const imagesIncrementalBackups = backups
      .filter(b => b.type === 'images_incremental')
      .sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));

    console.log(`Found ${imagesIncrementalBackups.length} images incremental backups to apply`);

    for (const backup of imagesIncrementalBackups) {
      console.log('Applying images incremental:', backup.name);
      await restoreIncrementalBackup(backup.id);
    }

    return {
      success: true,
      restored: {
        full: latestFullBackup,
        incrementals: incrementalBackups.map(b => b.name),
        imagesIncrementals: imagesIncrementalBackups.map(b => b.name),
      },
    };
  } catch (error) {
    console.error('Restore failed:', error);
    return {
      success: false,
      error: error.message,
      recovered: false,
    };
  } finally {
    setRestoreInProgress(false);
  }
};