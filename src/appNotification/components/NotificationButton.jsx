import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import React from 'react';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/core';
import {useAppState} from '../../contexts/AppStateContext';
import useNotificationStore from '../useNotificationStore';

const NotificationButton = () => {
  const navigation = useNavigation();
  const {userInfo} = useAppState(); // assuming this holds unread count
  const {notificationsCount} = useNotificationStore();

  return (
    <View>
      <TouchableOpacity
        onPress={() => {
          navigation.navigate('Notifications');
        }}
        style={styles.iconButton}>
        <Ionicons name="notifications-outline" size={24} color="#fff" />
        {notificationsCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {notificationsCount > 9 ? '9+' : notificationsCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default NotificationButton;

const styles = StyleSheet.create({
  iconButton: {
    padding: 5,
    borderRadius: 50,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: 'red',
    borderRadius: 8,
    paddingHorizontal: 4,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
