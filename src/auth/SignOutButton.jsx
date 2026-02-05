// components/SignOutButton.js
import React from 'react';
import { Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useAppState } from '../contexts/AppStateContext';
import { closeUserDatabase } from '../database/userDBSetupService';
import useDbStore from '../database/dbStore';
import useSettingsStore from '../Settings/settingsStore';
import AndroidBackgroundService from '../backgroundService/backgroundService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MenuOption } from 'react-native-popup-menu';
import { performBackupTask } from '../backupAdv/backupNew';
// import { performBackupTask } from '../backupAdv/backupManager';

export default function SignOutButton({ label = 'LogOut' }) {
  const navigation = useNavigation();
  const { setUserInfo,setItems,setDriveLinksList,setSelectedItems } = useAppState();
  const { closeDb, setLoading } = useDbStore();
  const { settings } = useSettingsStore();

  const handleSignOut = async () => {
    setLoading(true);
    try {
      if (settings.BACKUP_ENABLED) {
        await performBackupTask();
      }

      AndroidBackgroundService.init(true);

      await GoogleSignin.signOut();
      closeDb();
      setUserInfo(null);
      setItems([]);
      setDriveLinksList([]);
      setSelectedItems([])
      await AsyncStorage.setItem('isLoggedIn', JSON.stringify(false));
      await AsyncStorage.removeItem('userId');

      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'GoogleLoginScreen' }],
        })
      );
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setLoading(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: handleSignOut,
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <TouchableOpacity onPress={confirmSignOut}>
      <Text style={styles.menuOptionText}>Logout</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  menuOptionText: {
    fontSize: 14,
    paddingHorizontal: 25,
    color: '#007AFF',
    fontWeight: '500',
  },
});
