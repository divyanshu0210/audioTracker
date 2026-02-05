// components/ReceivedRequestsList.js
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

const ReceivedRequestsList = ({receivedRequests, onRespond}) => {
  const renderItem = ({item}) => (
    <View style={styles.notificationCard}>
      <View style={styles.notificationRow}>
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>
            <Text style={styles.nameText}>{item.sender.full_name}</Text>
            {' is requesting to be your '}
            <Text style={styles.roleText}>
              {item.type === 'mentor' ? 'mentee' : 'mentor'}
            </Text>
            .
          </Text>
          <Text style={styles.emailText}>{item.sender.email}</Text>
        </View>

        <View style={ {flexDirection: 'row', gap: 10, marginLeft: 8}}>
          <TouchableOpacity onPress={() => onRespond(item.id, 'approve')}>
            <Ionicons name="checkmark-circle" size={28} color="#28a745" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onRespond(item.id, 'reject')}>
            <Ionicons name="close-circle" size={28} color="#dc3545" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <FlatList
      data={receivedRequests}
      keyExtractor={(item) => item.id.toString()}
      renderItem={renderItem}
    />
  );
};



export default ReceivedRequestsList;
