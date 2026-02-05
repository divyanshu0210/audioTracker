// import { GoogleSignin } from '@react-native-google-signin/google-signin';
// import RNFetchBlob from 'react-native-blob-util';
// import { getDb } from './database'; // Assuming this is the path to your database helper
// import { resetDatabase, initDatabase } from './your-database-init-file'; // Adjust to your actual file where resetDatabase and initDatabase are defined


// // New: List backups from Google Drive
// const listBackupsFromDrive = async (backupType) => {
//   try {
//     const { accessToken } = await GoogleSignin.getTokens();
    
//     let query;
//     if (backupType === 'full') {
//       query = `name contains 'full_backup_' and trashed = false`;
//     } else if (backupType === 'incremental') {
//       query = `name contains 'incremental_backup_' and not name contains 'images_incremental_backup_' and trashed = false`;
//     } else if (backupType === 'images_incremental') {
//       query = `name contains 'images_incremental_backup_' and trashed = false`;
//     } else {
//       throw new Error('Invalid backup type');
//     }

//     const response = await RNFetchBlob.fetch(
//       'GET',
//       `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc&fields=files(id,name,createdTime)`,
//       {
//         'Authorization': `Bearer ${accessToken}`,
//         'Content-Type': 'application/json',
//       }
//     );

//     if (response.info().status >= 400) {
//       throw new Error(`Failed to list backups: ${response.data}`);
//     }

//     const { files } = response.json();
    
//     return files.map(file => ({
//       id: file.id,
//       name: file.name,
//       createdTime: file.createdTime,
//       timestamp: parseBackupTimestamp(file.name),
//     }));
//   } catch (error) {
//     console.error(`Error listing ${backupType} backups:`, error);
//     return [];
//   }
// };

// // Helper to parse timestamp from filename
// const parseBackupTimestamp = (name) => {
//   const match = name.match(/_backup_(.+)\.json$/);
//   return match ? match[1] : null;
// };

// // New: Download backup from Google Drive
// const downloadFromDrive = async (fileId) => {
//   try {
//     const { accessToken } = await GoogleSignin.getTokens();

//     const response = await RNFetchBlob.fetch(
//       'GET',
//       `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
//       {
//         'Authorization': `Bearer ${accessToken}`,
//       }
//     );

//     if (response.info().status >= 400) {
//       throw new Error(`Download failed: ${response.data}`);
//     }

//     return response.text(); // Return the JSON content as string
//   } catch (error) {
//     console.error('Error downloading backup:', error);
//     throw error;
//   }
// };

// // New: Insert data into tables
// const insertDataToTables = async (data) => {
//   const db = getDb();
//   const tableOrder = [
//     'folders',
//     'files',
//     'playlists',
//     'device_files',
//     'notebooks',
//     'categories',
//     'videos', // After playlists
//     'category_items', // After categories
//     'notes',
//     'video_watch_history',
//     'images' // Last, after notes
//   ];

//   for (const table of tableOrder) {
//     if (data[table] && data[table].length > 0) {
//       await new Promise((resolve, reject) => {
//         db.transaction(
//           tx => {
//             data[table].forEach(row => {
//               const columns = Object.keys(row);
//               const values = Object.values(row);
//               const placeholders = columns.map(() => '?').join(',');
//               const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
              
//               tx.executeSql(
//                 sql,
//                 values,
//                 () => {}, // Success per row
//                 (_, error) => {
//                   console.error(`Error inserting into ${table}:`, error);
//                   return true; // Continue transaction
//                 }
//               );
//             });
//           },
//           error => reject(error),
//           () => {
//             console.log(`Inserted data into ${table} successfully`);
//             resolve();
//           }
//         );
//       });
//     }
//   }
// };

// // Updated: Restore from backup (call this after user login and database init if needed)
// export const restoreFromBackup = async () => {
//   try {
//     console.log('Starting restore process...');

//     // Reset the database to ensure it's clean
//     // await resetDatabase();
//     // await initDatabase(); // Recreate tables

//     // List backups
//     const fullBackups = await listBackupsFromDrive('full');
//     if (fullBackups.length === 0) {
//       console.log('No full backups found. Restore skipped.');
//       return { success: true, message: 'No backups available' };
//     }

//     // Sort full backups by timestamp desc
//     fullBackups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
//     const latestFull = fullBackups[0];

//     // Restore full backup
//     const fullContent = await downloadFromDrive(latestFull.id);
//     const fullData = JSON.parse(fullContent);
//     await insertDataToTables(fullData);

//     // List and apply incremental backups after full
//     let incrementalBackups = await listBackupsFromDrive('incremental');
//     incrementalBackups = incrementalBackups
//       .filter(inc => new Date(inc.timestamp) > new Date(latestFull.timestamp))
//       .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

//     for (const inc of incrementalBackups) {
//       const incContent = await downloadFromDrive(inc.id);
//       const incData = JSON.parse(incContent);
//       await insertDataToTables(incData);
//     }

//     // List and apply ALL images incremental backups (since they accumulate)
//     let imagesBackups = await listBackupsFromDrive('images_incremental');
//     imagesBackups.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

//     for (const img of imagesBackups) {
//       const imgContent = await downloadFromDrive(img.id);
//       const imgData = JSON.parse(imgContent);
//       // Assuming the JSON structure is { images: [...] }
//       await insertDataToTables({ images: imgData.images || [] });
//     }

//     console.log('Restore completed successfully');
//     return { success: true };
//   } catch (error) {
//     console.error('Restore failed:', error);
//     return { success: false, error: error.message };
//   }
// };