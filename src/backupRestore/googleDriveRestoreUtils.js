import { GoogleSignin } from "@react-native-google-signin/google-signin";
import RNFetchBlob from "rn-fetch-blob";

export const listAvailableBackups = async () => {
    const { accessToken } = await GoogleSignin.getTokens();
    
    const response = await RNFetchBlob.fetch(
      'GET',
      'https://www.googleapis.com/drive/v3/files?' +
      `q=(name contains 'full_backup_' or name contains 'incremental_backup_' or name contains 'images_incremental_backup_') ` +
      `and trashed = false&` +
      'fields=files(id,name,createdTime,mimeType)&' +
      'orderBy=createdTime desc', // Newest first
      { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json' 
      }
    );
  
    return response.json().files.map(file => ({
      id: file.id,
      name: file.name,
      createdTime: file.createdTime,
      type: file.name.includes('full_backup') ? 'full' : 
            file.name.includes('images_incremental_backup') ? 'images_incremental' : 'incremental'
    }));
  };

  /**
 * Downloads a backup file from Google Drive
 * @param {string} fileId - Google Drive file ID
 * @param {string} localPath - Where to save the file
 * @returns {Promise<string>} - Path to downloaded file
 */
export const downloadBackupFromDrive = async (fileId, localPath) => {
    try {
      const { accessToken } = await GoogleSignin.getTokens();
  
      const response = await RNFetchBlob.config({
        fileCache: true,
        path: localPath,
      }).fetch(
        'GET',
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          'Authorization': `Bearer ${accessToken}`,
        }
      );
  
      return response.path();
  
    } catch (error) {
      console.error('Download failed:', error);
      throw new Error('Failed to download backup');
    }
  };