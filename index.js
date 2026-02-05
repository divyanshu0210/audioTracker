/**
 * @format
 */

import {AppRegistry} from 'react-native';
import BackgroundFetch from 'react-native-background-fetch';
import App from './src/App';
import {name as appName} from './app.json';
import AndroidBackgroundService from './src/backgroundService/backgroundService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import "./src/appNotification/appFCMNotification/firebase-messaging.js"; 

// Register headless task for Android
const HeadlessTask = async event => {
  const taskId = event.taskId;
  let isTimeout = event.timeout; // <-- true when your background-time has expired.
  if (isTimeout) {
    // This task has exceeded its allowed running-time.
    // You must stop what you're doing immediately finish(taskId)
    console.log('[BackgroundFetch] Headless TIMEOUT:', taskId);
    BackgroundFetch.finish(taskId);
    return;
  }
  console.log('[BackgroundFetch HeadlessTask] start: ', taskId);

  // try {
  //   const [isLoggedInRaw, isBackupEnabledRaw] = await Promise.all([
  //     AsyncStorage.getItem('isLoggedIn'),
  //     // AsyncStorage.getItem('BACKUP_ENABLED'),
  //   ]);

  //   const isLoggedIn = JSON.parse(isLoggedInRaw);
  //   // const isBackupEnabled = JSON.parse(isBackupEnabledRaw);

  //   if (isLoggedIn) {
      await AndroidBackgroundService.runBackgroundTask(taskId);
  //   }
  // } catch (error) {
    // console.error('Error in HeadlessTask:', error);
  // }finally{

    BackgroundFetch.finish(taskId);
  // }

};

AppRegistry.registerComponent(appName, () => App);
// TrackPlayer.registerPlaybackService(()=> playbackService);
// Register your headless task
BackgroundFetch.registerHeadlessTask(HeadlessTask);
