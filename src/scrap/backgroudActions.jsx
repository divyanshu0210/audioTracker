// import React, { useState } from 'react';
// import {
//   SafeAreaView,
//   View,
//   Text,
//   Button,
//   StyleSheet,
//   Platform,
//   PermissionsAndroid,
// } from 'react-native';
// import BackgroundService from 'react-native-background-actions';

// const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

// const veryIntensiveTask = async (taskDataArguments) => {
//   const { delay } = taskDataArguments;
//   let count = 0;
//   const currentTime = new Date().toLocaleString(); // Get the current time in a readable format
//   console.log(`Backup ran at ${currentTime}, Background count: ${count}`);
//   await new Promise(async (resolve) => {
//     for (; BackgroundService.isRunning(); count++) {
//       console.log('Background count:', count,);

//       // 🔄 Update the notification description dynamically
//       await BackgroundService.updateNotification({
//         taskDesc: `Count: ${count}`,
//       });

//       await sleep(delay);
//     }
//     resolve();
//   });
// };

// const options = {
//   taskName: 'Background Counter',
//   taskTitle: 'Counter Running',
//   taskDesc: 'Counting in the background...',
//   taskIcon: {
//     name: 'ic_launcher',
//     type: 'mipmap',
//   },
//   color: '#ff00ff',
//   linkingURI: 'yourapp://home',
//   parameters: {
//     delay:1000,
//   },
// };

// const App = () => {
//   const [running, setRunning] = useState(false);

//   const requestPermissions = async () => {
//     if (Platform.OS === 'android') {
//       const granted = await PermissionsAndroid.request(
//         PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
//       );
//       return granted === PermissionsAndroid.RESULTS.GRANTED;
//     }
//     return true;
//   };

//   const startService = async () => {
//     const granted = await requestPermissions();
//     if (!granted) {
//       alert('Notification permission denied');
//       return;
//     }

//     if (!BackgroundService.isRunning()) {
//       try {
//         await BackgroundService.start(veryIntensiveTask, options);
//         setRunning(true);
//       } catch (error) {
//         console.error('Failed to start background service:', error);
//         alert('Error: ' + error.message);
//       }

//       setRunning(true);
//     }
//   };

//   const stopService = async () => {
//     await BackgroundService.stop();
//     setRunning(false);
//   };

//   return (
//     <SafeAreaView style={styles.container}>
//       <Text style={styles.title}>Background Task Demo</Text>
//       <View style={styles.buttonContainer}>
//         <Button title="Start Task" onPress={startService} disabled={running} />
//         <Button title="Stop Task" onPress={stopService} disabled={!running} />
//       </View>
//     </SafeAreaView>
//   );
// };

// const styles = StyleSheet.create({
//   container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
//   title: { fontSize: 20, marginBottom: 20 },
//   buttonContainer: { flexDirection: 'row', gap: 20 },
// });

// export default App;


// ---------------------------------------------------

// import React, { useEffect } from 'react';
// import { View, Text, Button, StyleSheet } from 'react-native';
// import AndroidBackgroundService from './src/backup/backgroundService';

// const App = () => {
//   useEffect(() => {
//     // Initialize the background service when app starts
//     AndroidBackgroundService.init();
//   }, []);

//   const simulateBackgroundFetch = () => {
//     // Manually trigger a background fetch for testing
//     AndroidBackgroundService.performBackgroundTask();
//   };

//   return (
//     <View style={styles.container}>
//       <Text style={styles.title}>Background Fetch POC</Text>
//       <Text style={styles.subtitle}>This app demonstrates background fetch capabilities</Text>

//       <Button
//         title="Simulate Background Fetch"
//         onPress={simulateBackgroundFetch}
//       />
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     padding: 20,
//   },
//   title: {
//     fontSize: 24,
//     fontWeight: 'bold',
//     marginBottom: 10,
//   },
//   subtitle: {
//     fontSize: 16,
//     color: '#666',
//     marginBottom: 30,
//     textAlign: 'center',
//   },
// });

// export default App;