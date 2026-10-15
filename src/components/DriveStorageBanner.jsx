import React, {useCallback, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {getDriveStorageQuota} from '../share/driveUpload';

const WARNING_PERCENT = 80;

const formatBytes = bytes => {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};

/** A non-blocking warning for the Drive tab. Quota failures are intentionally silent. */
const DriveStorageBanner = () => {
  const [quota, setQuota] = useState(null);

  const loadQuota = useCallback(() => {
    let active = true;
    getDriveStorageQuota()
      .then(value => {
        if (active) setQuota(value);
      })
      .catch(() => {
        if (active) setQuota(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadQuota);

  if (!quota?.limit || quota.percent == null || quota.percent < WARNING_PERCENT) {
    return null;
  }

  const critical = quota.percent >= 90;
  return (
    <View style={[styles.banner, critical ? styles.critical : styles.warning]}>
      <Ionicons
        name={critical ? 'alert-circle' : 'warning-outline'}
        size={20}
        color={critical ? '#9d1c1c' : '#8a5a00'}
      />
      <Text style={[styles.text, critical ? styles.criticalText : styles.warningText]}>
        Google Drive is {quota.percent}% full ({formatBytes(quota.remaining)} left).{' '}
        Backups and uploads may fail if it fills up.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 2,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  warning: {backgroundColor: '#fff4d6'},
  critical: {backgroundColor: '#fde4e4'},
  text: {flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 17},
  warningText: {color: '#6f4a00'},
  criticalText: {color: '#7f1515'},
});

export default React.memo(DriveStorageBanner);
