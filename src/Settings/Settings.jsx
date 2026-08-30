import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  Switch,
  ActivityIndicator,
} from 'react-native';
import {Button} from 'react-native-paper';
import {ScrollView} from 'react-native-gesture-handler';
import useSettingsStore from './settingsStore';
import SignOutButton from '../auth/SignOutButton';
import useBackupStore from '../stores/backupStore';
import { navigationRef } from '../handlers/navigationRef';
import { useNavigation } from '@react-navigation/core';
const SettingsScreen = () => {
  const {settings, updateSettings} = useSettingsStore();
    const navigation = useNavigation();


  const {
  loading,
  lastBackupSyncTime,
  toggleBackup,
  runManualBackup,
  checkBackupStatus,
} = useBackupStore();
  
  const [watchTime, setWatchTime] = useState(
    settings.TARGET_WATCH_TIME.toString(),
  );
  const [newWatchTime, setNewWatchTime] = useState(
    settings.TARGET_NEW_WATCH_TIME.toString(),
  );

  const [notificationOpacity] = useState(new Animated.Value(0));
  const { backupRunning, syncRunning } = useBackupStore();
  const isBackupInProgress = backupRunning || syncRunning;

  const showNotification = () => {
    Animated.sequence([
      Animated.timing(notificationOpacity, {
        toValue: 1,
        duration: 10,
        useNativeDriver: true,
      }),
      Animated.delay(1500),
      Animated.timing(notificationOpacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Settings',
      headerRight: () => <SignOutButton />,
    });
  }, []);

  // Automatically update settings whenever they change
  // For general settings
  useEffect(() => {
    const updatedSettings = {
      TARGET_WATCH_TIME: parseInt(watchTime) || 0,
      TARGET_NEW_WATCH_TIME: parseInt(newWatchTime) || 0,
      // 'Mentor Mobile Numbers': mentorNumbers,
    };

    updateSettings(updatedSettings);
    // showNotification();
  }, [watchTime, newWatchTime]);

  const handleAutoplayToggle = value => {
    const updated = {
      autoplay: value,
    };
    updateSettings(updated);
  };

  const handleAutoPauseOnTypingToggle = value => {
    updateSettings({autoPauseOnTyping: value});
  };

  return (
    <ScrollView style={styles.container}>
      {/* Notification Banner */}
      <Animated.View
        style={[styles.notification, {opacity: notificationOpacity}]}>
        <Text style={styles.notificationText}>
          Settings saved successfully!
        </Text>
      </Animated.View>

      {/* Target Watch Time Section */}
      {/* <View style={styles.section}>
        <Text style={styles.label}>Target Watch Time (minutes)</Text>
        <TextInput
          value={watchTime}
          onChangeText={setWatchTime}
          keyboardType="numeric"
          style={styles.input}
          placeholder="Enter target minutes"
        />
      </View> */}

      {/* Target New Watch Time Section */}
      <View style={styles.section}>
        <Text style={styles.label}>Target Watch Time (minutes)</Text>
        <TextInput
          value={newWatchTime}
          onChangeText={setNewWatchTime}
          keyboardType="numeric"
          style={styles.input}
          placeholder="Enter new target minutes"
        />
      </View>

      {/* Backup Settings Section */}
      {/* Backup Settings Section */}
      <View style={styles.section}>
        <Text style={styles.label}>Data Backup</Text>
        <Text style={{color: '#555', marginBottom: 5}}>
          Back up your data to restore it on new phone after you download the
          app on it.
          {/* keep on your Google Account's Storage. You can */}
        </Text>

        {/* Last backup time */}
        <Text style={{marginTop: 15, fontSize: 14, color: '#666'}}>
          Last backup: {lastBackupSyncTime}
        </Text>

        {/* Manual backup button */}
        <Button
          mode="contained"
        onPress={runManualBackup}
          style={[styles.saveButton, {marginTop: 10}]}
          labelStyle={styles.buttonText}>
          { isBackupInProgress ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            'Backup'
          )}
        </Button>

        <Button
          mode="contained"
          onPress={checkBackupStatus}
          style={[styles.saveButton, {marginTop: 10}]}
          labelStyle={styles.buttonText}>
          Check Status
        </Button>      
        <Button
          mode="contained"
          onPress={() => navigationRef.navigate('BackupExplorerScreen')}
          style={[styles.saveButton, {marginTop: 10}]}
          labelStyle={styles.buttonText}>
          Explore Backups
        </Button>

        {/* Backup toggle */}
        <View style={styles.switchRow}>
          <Text style={styles.backupLabel}>Automatic Backup</Text>
          {/* <Text style={{fontSize: 12}}>
            {settings.BACKUP_ENABLED ? 'Enabled' : 'Disabled'}
          </Text> */}
          <Switch
            trackColor={{false: '#bdbdbd', true: '#b2dfdb'}}
            thumbColor={settings.BACKUP_ENABLED ? '#00796b' : '#eeeeee'}
            value={settings.BACKUP_ENABLED}
            disabled={loading}
            onValueChange={toggleBackup}
          />
        </View>
      </View>

      {/* Player Settings Section */}
      <View style={styles.section}>
        <Text style={styles.label}>Player Settings</Text>

        {/* Autoplay Toggle */}
        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, {color: '#000'}]}>
            Autoplay Next Videos
          </Text>
          <Switch
            trackColor={{false: '#bdbdbd', true: '#b2dfdb'}}
            thumbColor={settings.autoplay ? '#00796b' : '#eeeeee'}
            value={settings.autoplay ?? true} // Default to true if not set
            onValueChange={handleAutoplayToggle}
          />
        </View>

        {/* Auto-pause while taking notes */}
        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, {color: '#000'}]}>
            Pause While Typing Notes
          </Text>
          <Switch
            trackColor={{false: '#bdbdbd', true: '#b2dfdb'}}
            thumbColor={settings.autoPauseOnTyping ? '#00796b' : '#eeeeee'}
            value={settings.autoPauseOnTyping ?? true} // Default to true if not set
            onValueChange={handleAutoPauseOnTypingToggle}
          />
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
    backgroundColor: '#f5f5f5',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  section: {
    marginBottom: 25,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#444',
  },
  backupLabel: {
    fontSize: 16,
    fontWeight: '600',
    // marginBottom: 8,
    color: '#444',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: '#000',
  },
  list: {
    maxHeight: 150,
    marginBottom: 10,
  },
  numberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  numberText: {
    fontSize: 16,
  },
  removeButton: {
    padding: 5,
  },
  removeText: {
    color: 'red',
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 10,
  },
  addNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addButton: {
    borderRadius: 6,
    backgroundColor: '#4CAF50',
  },
  saveButton: {
    marginTop: 10,
    borderRadius: 50,
    backgroundColor: '#2196F3',
    // paddingVertical: 5,
    width: '30%',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  notification: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#4BB543',
    padding: 15,
    zIndex: 1000,
    alignItems: 'center',
  },
  notificationText: {
    color: 'white',
    fontWeight: 'bold',
  },
  switchRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  picker: {
    color: '#000',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    paddingHorizontal: 10,
    backgroundColor: '#fafafa',
  },
});

export default SettingsScreen;
