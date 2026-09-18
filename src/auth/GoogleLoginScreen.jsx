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
import {useAppState} from '../contexts/AppStateContext';
import {initUserDatabase} from '../database/UserDatabaseInstance';
import useDbStore from '../database/dbStore';
import {setupFCM} from '../appNotification/appFCMNotification/fcmNotificationService';
import {getOrCreateDefaultNotebookId} from '../database/C';
import useBackupStore from '../stores/backupStore';
import useRestoreStore from '../backupRestore/restoreStore';
import {useNotesStore} from '../stores/useNotesStore';
import LoginRestoreProgressBar from './LoginRestoreProgressBar';
import { checkAndPromptRestore } from '../backupRestore/restoreManager';
import {consumePendingRoute, landAfterLogin} from '../handlers/navigationIntent';
import {hasMediaReadPermission} from '../utils/mediaFile';
import notifee from '@notifee/react-native';
import {isAllowed} from '../appNotification/notificationPermission';

const GoogleLoginScreen = ({navigation}) => {
  // Starts true, because the first thing this screen does is look for a
  // session. Starting false meant the sign-in button was painted on the
  // frame before that check began, and anyone already signed in saw an
  // invitation to sign in again on the way past.
  const [isLoading, setIsLoading] = useState(true);

  const {setUserInfo} = useAppState();
  const {initDb} = useDbStore();
  const {initialize: initializeSettings} = useSettingsStore();
  const {appStartupBackupRoutine} = useBackupStore();
  const {isRestoring, checkingAvailableBackup} = useRestoreStore();

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
      }
    } catch (error) {
      setIsLoading(false);
      handleSignInError(error);
    }
  };

  // Both of them, because the app needs both — see PermissionGate, which is
  // where they are explained and asked for.
  const hasAllPermissions = async () => {
    try {
      const [media, notifications] = await Promise.all([
        hasMediaReadPermission(),
        notifee.getNotificationSettings().then(isAllowed),
      ]);
      return media && notifications;
    } catch (error) {
      // Unanswerable is not the same as granted, but sending someone to the
      // gate they can satisfy is the better failure: it reads the same two
      // values again and lets them straight through if they are fine.
      console.log('[Login] Could not read permissions:', error?.message);
      return false;
    }
  };

    const navigateToMain = async (userInfo) => {
    // The restore has just switched isRestoring off, and what comes next is
    // several awaits before the replace: a default notebook, settings, the
    // startup backup routine. With nothing claiming the screen for that
    // stretch it fell through to the sign-in button — an app that finished
    // restoring someone's library and then asked them who they were.
    setIsLoading(true);
    try {
      const defaultNotebookIdValue = await getOrCreateDefaultNotebookId();
      useNotesStore.getState().setDefaultNotebookId(defaultNotebookIdValue);
      await initializeSettings();
      appStartupBackupRoutine();
      const user = userInfo.user ?? userInfo;
      // If a deep link (e.g. the downloads notification) launched the app, land
      // straight on that screen WITHOUT MainApp in the stack, so MainApp's
      // heavy mount/data-loading is skipped entirely. It's built lazily when
      // the user leaves that screen via back (launchedDirectly → goHome).
      const pendingRoute = consumePendingRoute();
      landAfterLogin(navigation, {pendingRoute, user});
    } catch (e) {
      console.error('[Login] Post-restore nav error:', e);
      Alert.alert('Error', 'Failed to complete setup. Please restart the app.');
    }
  };

  const handleUserSession = async (userInfo, mode) => {
    if (!userInfo) return;
    await AsyncStorage.setItem('userId', userInfo.user.id);
    await useBackupStore.getState().setNativePreference('userId', userInfo.user.id);
    try {
      // Awaited: initDb builds the schema before it hands the db over, and
      // everything below this line reads from it.
      await initDb(userInfo.user.id);
      await initUserDatabase(userInfo.user.id);

      setUserInfo(userInfo.user);
      mode === 'signIn'
        ? syncUserToBackend(userInfo.user).then(() => setupFCM(userInfo.user))
        : setupFCM(userInfo.user);

      // Permissions before the backup check, not after it.
      //
      // The restore is where a device file's address is at its most broken —
      // every row arrives holding one from another install — and repairing
      // that needs the media permission. Asked for afterwards, the repair
      // had nothing to work with and the library came up full of warnings
      // instead. So the gate goes first, and the restore runs knowing the
      // app can read what it is about to rebuild.
      //
      // The gate hands back to this screen rather than carrying the flow
      // onwards: restoreSession runs again, the session is still there, and
      // this time the check below passes straight through to the restore.
      // One owner for what happens after login, which is this function.
      if (!(await hasAllPermissions())) {
        navigation.replace('PermissionGate');
        return;
      }

      await checkAndPromptRestore(userInfo, navigateToMain);
    } catch (error) {
      console.error('Error handling user session:', error);
      setIsLoading(false);
    }
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

        {isRestoring ? (
          <LoginRestoreProgressBar />
        ) : isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#ffffff" />
            {checkingAvailableBackup && (
              <Text style={styles.loaderText}>Checking for backups...</Text>
            )}
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
    backgroundColor: '#18222d',
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
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
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
