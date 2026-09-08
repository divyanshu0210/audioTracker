import notifee from '@notifee/react-native';
import React, {useCallback, useEffect, useState} from 'react';
import {AppState, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {isAllowed} from '../notificationPermission';

// Delivery and display are two separate things. setupFCM registers a device
// token whatever the user answered, so pushes reach the phone either way — but
// without POST_NOTIFICATIONS the OS won't let any of them on screen, and after
// two dismissals Android stops offering its own dialog. From that point the
// only way back is system settings, so the app has to say so itself; nothing
// else in the UI distinguishes "no notifications yet" from "notifications are
// silently being thrown away".
const NotificationPermissionBanner = () => {
  const [blocked, setBlocked] = useState(false);

  const checkPermission = useCallback(async () => {
    try {
      const settings = await notifee.getNotificationSettings();
      setBlocked(!isAllowed(settings));
    } catch (error) {
      console.error('Could not read notification settings:', error);
    }
  }, []);

  useEffect(() => {
    checkPermission();

    // Granting happens in system settings, which backgrounds the app — so the
    // return trip is what clears this banner, not anything on this screen.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        checkPermission();
      }
    });

    return () => subscription.remove();
  }, [checkPermission]);

  const enableNotifications = async () => {
    try {
      // If the choice is still open — a first launch on Android 13+, or iOS
      // before the first ask — the dialog is all that's needed. Once it has
      // been denied twice this returns immediately without showing anything,
      // and settings is the only remaining route.
      const settings = await notifee.requestPermission();
      if (!isAllowed(settings)) {
        await notifee.openNotificationSettings();
      }
    } catch (error) {
      console.error('Could not open notification settings:', error);
    }

    checkPermission();
  };

  if (!blocked) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.headingRow}>
        <Ionicons name="notifications-off-outline" size={20} color="#8a6d3b" />
        <Text style={styles.title}>Notifications are turned off</Text>
      </View>

      <Text style={styles.body}>
        Requests and assignments still show up on this screen, but nothing will
        appear on your phone until you turn them on.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={enableNotifications}
        activeOpacity={0.8}>
        <Text style={styles.buttonText}>Turn on</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fcf3d7',
    borderColor: '#f0d99b',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 15,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8a6d3b',
    flexShrink: 1,
  },
  body: {
    fontSize: 13,
    color: '#7a6134',
    marginTop: 6,
    lineHeight: 18,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#007bff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 5,
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default NotificationPermissionBanner;
