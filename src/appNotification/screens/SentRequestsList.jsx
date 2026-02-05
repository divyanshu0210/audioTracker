// components/SentRequestsList.js
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { styles } from './styles';

const SentRequestsList = ({sentRequests, onCancel}) => {
  const renderItem = ({item}) => (
    <View style={styles.notificationCard}>
      <View style={styles.notificationRow}>
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>
            You requested{' '}
            <Text style={styles.nameText}>{item.receiver.full_name}</Text> to be
            your <Text style={styles.roleText}>{item.type}</Text>.
          </Text>
          <Text style={styles.emailText}>{item.receiver.email}</Text>
        </View>

        <TouchableOpacity onPress={() => onCancel(item.id)}>
          <Ionicons name="close-circle" size={28} color="#dc3545" />
        </TouchableOpacity>
      </View>
    </View>
  );


  return (
    <FlatList
      data={sentRequests}
      keyExtractor={(item) => item.id.toString()}
      renderItem={renderItem}
    />
  );
};



export default SentRequestsList;
