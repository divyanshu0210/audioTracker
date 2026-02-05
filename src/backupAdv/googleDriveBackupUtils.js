import { GoogleSignin } from '@react-native-google-signin/google-signin';
import RNFetchBlob from 'react-native-blob-util';


export const uploadToGoogleDrive = async (filePath, fileName, mimeType = 'application/zip') => {
    const { accessToken } = await GoogleSignin.getTokens();
  
  const response = await RNFetchBlob.fetch(
    'POST',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'multipart/related',
    },
    [
      {
        name: 'metadata',
        data: JSON.stringify({
          name: fileName,
          mimeType: mimeType,
          parents: ['root'], // Special folder for app data
        }),
        type: 'application/json',
      },
      {
        name: 'file',
        filename: fileName,
        data: RNFetchBlob.wrap(filePath),
      },
    ]
  );

  if (response.info().status >= 400) {
    throw new Error(`Google Drive upload failed: ${response.data}`);
  }

  return response.json();
};

/**
 * Simplified Google Drive upload verification
 * Just checks if file exists and has size > 0
 */
export const verifyGoogleDriveUpload = async (fileId) => {
  try {
    const { accessToken } = await GoogleSignin.getTokens();

    // Get file metadata
    const response = await RNFetchBlob.fetch(
      'GET',
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,size`,
      {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    );

    // Check response status
    if (response.info().status >= 400) {
      console.error('Verification failed: API error', response.data);
      return false;
    }

    const file = response.json();

    // Basic validation
    if (!file?.id) {
      console.error('Verification failed: No file ID');
      return false;
    }

    if (file.size === 0) {
      console.error('Verification failed: File size is 0');
      return false;
    }

    console.log('Backup verified successfully');
    return true;

  } catch (error) {
    console.error('Verification error:', error.message);
    return false;
  }
};

/**
 * Deletes old backup files from Google Drive
 * @param {string} backupType - 'full' or 'incremental'
 * @param {number} keepLast - How many recent backups to keep
 */
export const deleteOldDriveBackups = async (backupType, keepLast = 2) => {
  if (backupType === 'images_incremental') {
    console.log('Skipping deletion of images incremental backups');
    return;
  }
  try {
    const { accessToken } = await GoogleSignin.getTokens();
    
    // 1. Search for backup files in Drive
    let query;
    if (backupType === 'incremental') {
      query = `name contains 'incremental_backup_' and not name contains 'images_incremental_backup_' and trashed = false`;
    } else {
      query = `name contains '${backupType}_backup_' and trashed = false`;
    }
    // const query = `name contains '${backupType}_backup_' and trashed = false`;
    const response = await RNFetchBlob.fetch(
      'GET',
     `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc`,
      {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    );

    const { files } = response.json();
    
    // 2. Identify files to delete (keep most recent N files)
    const filesToDelete = files.slice(keepLast);
    
    if (filesToDelete.length === 0) {
      console.log('No old backups to delete');
      return;
    }

    // 3. Delete files in parallel
    await Promise.all(
      filesToDelete.map(async (file) => {
        await RNFetchBlob.fetch(
          'DELETE',
          `https://www.googleapis.com/drive/v3/files/${file.id}`,
          { 'Authorization': `Bearer ${accessToken}` }
        );
        console.log(`Deleted old backup: ${file.name}`);
      })
    );

  } catch (error) {
    console.error('Error deleting old backups:', error.message);
    // Fail silently - don't block backup process
  }
};




