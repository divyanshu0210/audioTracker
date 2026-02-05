import RNFS from 'react-native-fs';
import {NativeModules, PermissionsAndroid} from 'react-native';
import axios from 'axios';
import useDbStore from './dbStore';

// const {ShellModule} = NativeModules;

const pullDatabase = async () => {
  try {
    const response = await axios.get('http://localhost:3000/pull-db');
    console.log('Server Response:', response.data);
  } catch (error) {
    console.error('Error pulling database:', error);
    alert('Failed to pull database');
  }
};

const copyDatabaseToAccessibleLocation = async () => {
  const userId = useDbStore.getState().currentUserId;
  // const dbPath = `/data/user/0/com.audiotracker/files/DriveApp.db`; // Your actual path
  const dbPath = `/data/user/0/com.audiotracker/files/DriveApp_${userId}.db`; // Your actual path
  
  const dbPath2 = `${RNFS.DocumentDirectoryPath}/restore_DriveApp_${userId}.db`; // Your actual path
  // const dbPath2 = '/data/user/0/com.audiotracker/files/DriveApp.db'; // Your actual path
  const destPath = `${RNFS.ExternalDirectoryPath}/DriveAppFTS.db`; // Copy to an accessible location
  const destPath2 = `${RNFS.ExternalDirectoryPath}/DriveApp.db`; // Copy to an accessible location

await PermissionsAndroid.requestMultiple([
  PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
  PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
]);
  try {
    console.log('📂 Copying database to an accessible internal location...');
    const dbExists = await RNFS.exists(dbPath);
    const db2Exists = await RNFS.exists(dbPath2);
    if (dbExists) {
      await RNFS.copyFile(dbPath, destPath);
      console.log(`✅ Database copied to: ${destPath}`);
    } else {
      console.warn(`⚠️ Source database not found at: ${dbPath}`);
    }

    if (db2Exists) {
      await RNFS.copyFile(dbPath2, destPath2);
      console.log(`✅ Database copied to: ${destPath2}`);
    } else {
      console.warn(`⚠️ Restore database not found at: ${dbPath2}`);
    }
    console.log(`✅ FTS Database copied to: ${destPath2}`);
  } catch (error) {
    console.error('❌ Error in copying database:', error);
  }

  try {
    pullDatabase();
  } catch (error) {
    console.error('❌ Error pulling database:', error);
  }

  // Execute shell command using Native Module
  // try {
  //   console.log('🖥️ Executing shell command...');
  //   const result = await ShellModule.executeCommand('logcat -d | grep "Screen turned"');
  //   console.log('📜 Shell Output:', result);
  // } catch (error) {
  //   console.error('❌ Error executing shell command:', error);
  // }
};

export default copyDatabaseToAccessibleLocation;

