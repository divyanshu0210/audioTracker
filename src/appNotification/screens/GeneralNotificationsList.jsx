// components/GeneralNotificationsList.js
import React from 'react';
import {View, Text, StyleSheet, FlatList} from 'react-native';
import {formatNotification} from '../notificationsMgt';
import { styles } from './styles';

const GeneralNotificationsList = ({notifications}) => {
  const filteredNotifications = notifications.filter(
    item => item.type !== 'mentor' && item.type !== 'mentee',
  );
  const renderItem = ({item}) => {
    return (
      <View
        style={[
          styles.notificationCard,
          item.status === 'sent' && styles.sentNotificationCard,
        ]}>
        <View style={styles.notificationRow}>
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>{formatNotification(item)}</Text>
            <Text style={styles.emailText}>
              {new Date(item.created_at).toLocaleString()}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={filteredNotifications}
      keyExtractor={item => item.id.toString()}
      renderItem={renderItem}
      ListEmptyComponent={
        <Text style={styles.emptyText}>You are Up to Date!!</Text>
      }
    />
  );
};


export default GeneralNotificationsList;
