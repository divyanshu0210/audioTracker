import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import useSettingsStore from '../Settings/settingsStore';
import {syncUserToBackend} from '../appMentorBackend/userMgt';
import WebSocketManager from '../appWebSocket/WebSocketManager';
import {handleWSNotifications} from '../appNotification/notificationsMgt';
import AndroidBackgroundService from '../backgroundService/backgroundService';
import {
  checkAndPromptRestore,
  hasRestoreCheckCompleted,
} from '../backupRestore/restoreManager';
import {useAppState} from '../contexts/AppStateContext';
import {initUserDatabase} from '../database/UserDatabaseInstance';
import {initDatabase, resetDatabase} from '../database/database';
import useDbStore from '../database/dbStore';
import {setupFCM} from '../appNotification/appFCMNotification/fcmNotificationService';
import {initializeBackupSystem} from '../backupAdv/backupNew';

const GoogleLoginScreen = ({navigation}) => {
  const [isLoading, setIsLoading] = useState(false);
  const {setUserInfo} = useAppState();
  const {initDb} = useDbStore();

  // Get Zustand store methods and state
  const {initialize: initializeSettings} = useSettingsStore();

  useEffect(() => {
    GoogleSignin.configure({
      webClientId:
        '196911493674-ckh0hql1d8s8auii5bp3berm2lmej1k2.apps.googleusercontent.com',
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.appdata',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    });

    const restoreSession = async () => {
      setIsLoading(true);
      try {
        const userInfo = GoogleSignin.getCurrentUser();
        console.log('userInfo', userInfo);
        await handleUserSession(userInfo);
      } catch (error) {
        console.log('Session check error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const signIn = async () => {
    try {
      setIsLoading(true);
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      console.log('Logged in', response?.data?.user);

      if (response?.data.user) {
        await handleUserSession(response?.data, 'signIn');
        syncUserToBackend(response?.data.user);
      }
    } catch (error) {
      setIsLoading(false);
      handleSignInError(error);
    }
  };

  // Initialize database for user and handle user session
  const handleUserSession = async (userInfo, sessionType = 'restore') => {
    if (!userInfo) return;
    await AsyncStorage.setItem('isLoggedIn', JSON.stringify(true));
    await AsyncStorage.setItem('userId', userInfo.user.id);
    try {
      // Initialize user-specific database
      const db = initDb(userInfo.user.id);
      // await resetDatabase()
      await initDatabase();
      await initUserDatabase(userInfo.user.id);

      setUserInfo(userInfo.user);
      // const ws = new WebSocketManager(userInfo.user.id, handleWSNotifications);
      setupFCM(userInfo.user);

      // Check for backup restore prompt
      const alreadyChecked = await hasRestoreCheckCompleted(userInfo.user.id);
      console.log('Has restore been checked :', alreadyChecked);
      if (!alreadyChecked) {
        console.log('Checking for backup...');
        checkAndPromptRestore(userInfo.user.id);
      }
      const settings = await initializeSettings(); // initialises the store with default/stored settings
      // Creates backup directory
      initializeBackupSystem();
      await AndroidBackgroundService.init();
      await AndroidBackgroundService.ensureAndSyncBackupBGService(settings);

      navigation.replace('MainApp', {user: userInfo.user});
    } catch (error) {
      console.error('Error handling user session:', error);
      throw error;
    }
  };

  const handleBackupAndRestore = () => {};

  const handleNotification = data => {
    console.log('📩 Notification:', data.message);
    // Show in-app banner or save to state
  };

  const handleSignInError = error => {
    let errorMessage = 'An unknown error occurred. Please try again.';

    switch (error.code) {
      case statusCodes.SIGN_IN_CANCELLED:
        errorMessage = 'You cancelled the sign in process.';
        break;
      case statusCodes.IN_PROGRESS:
        errorMessage = 'Sign in is already in progress.';
        break;
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        errorMessage = 'Google Play services are not available or outdated.';
        break;
    }

    Alert.alert('Problem in sign in', errorMessage);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require('../assets/appIcon.png')}
          style={styles.appIcon}
        />
        <Text style={styles.title}>Welcome To MediaTracker</Text>
        <Text style={styles.subtitle}>
          Your Media, Your Notes, Your Progress
        </Text>
        <Text style={styles.subtitle}>All in One Place!</Text>
        <View style={{marginBottom: 80}} />
        {/* <Text style={styles.subtitle}>Sign in to continue...</Text> */}

        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        ) : (
          <TouchableOpacity
            style={styles.googleButton}
            onPress={signIn}
            activeOpacity={0.7}>
            <View style={styles.buttonContent}>
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By continuing, you agree to our Terms and Conditions
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18222d', // dark background
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  appIcon: {
    width: 220,
    height: 220,
    marginBottom: 30,
    borderRadius: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#DDD',
    marginBottom: 10,
    textAlign: 'center',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 50,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonText: {
    color: '#4285F4',
    fontSize: 16,
    fontWeight: '600',
  },
  loaderContainer: {
    marginVertical: 20,
    alignItems: 'center',
  },
  footer: {
    marginTop: 30,
    paddingHorizontal: 20,
  },
  footerText: {
    fontSize: 12,
    color: '#ccc',
    textAlign: 'center',
  },
});

export default GoogleLoginScreen;
