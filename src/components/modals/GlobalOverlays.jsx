import React from 'react';
import {View, ActivityIndicator, Text, StyleSheet} from 'react-native';

import useDbStore from '../../database/dbStore';
import useBackupStore from '../../stores/backupStore';
import useRestoreStore from '../../backupRestore/restoreStore';

function GlobalOverlays() {
  const {loading} = useDbStore();

  const {backupRunning, syncRunning} = useBackupStore();

  const {checkingAvailableBackup} = useRestoreStore();

  const isBackupInProgress = backupRunning || syncRunning;

  return (
    <>
      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>
            {isBackupInProgress
              ? 'Saving your Progress'
              : 'Signing out...'}
          </Text>
        </View>
      )}

      {checkingAvailableBackup && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>
            Checking for backups..
          </Text>
        </View>
      )}
    </>
  );
}

export default React.memo(GlobalOverlays);

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },

  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#fff',
  },
});