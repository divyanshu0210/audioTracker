import React from 'react';
import {ActivityIndicator, View, Text, TouchableOpacity} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {formatNotification} from '../notificationsMgt';
import {styles} from './styles';

// One row renderer for the whole screen. The three kinds share a card, a row
// layout and a message column, and differ only in their text and their
// controls — which is why three sibling lists was the wrong shape for them.
//
// The discriminator is `kind`, assigned where the rows are merged, not `type`:
// a request's type is 'mentor' | 'mentee' while a notification's is
// 'assignment' | 'approved' | 'cancelled' | …, so type alone cannot say which
// table a row came from.
const NotificationRow = ({item, pending, onCancel, onRespond}) => {
  switch (item.kind) {
    case 'sent_request':
      return (
        <Card>
          <Message>
            <Text style={styles.messageText}>
              You requested{' '}
              <Text style={styles.nameText}>{item.receiver.full_name}</Text> to
              be your <Text style={styles.roleText}>{item.type}</Text>.
            </Text>
            <Text style={styles.emailText}>{item.receiver.email}</Text>
          </Message>

          {pending ? (
            <ActivityIndicator size="small" color="#007bff" />
          ) : (
            <TouchableOpacity onPress={() => onCancel(item.id)}>
              <Ionicons name="close-circle" size={28} color="#dc3545" />
            </TouchableOpacity>
          )}
        </Card>
      );

    case 'received_request':
      return (
        <Card>
          <Message>
            <Text style={styles.messageText}>
              <Text style={styles.nameText}>{item.sender.full_name}</Text>
              {' is requesting to be your '}
              <Text style={styles.roleText}>
                {item.type === 'mentor' ? 'mentee' : 'mentor'}
              </Text>
              .
            </Text>
            <Text style={styles.emailText}>{item.sender.email}</Text>
          </Message>

          <View style={styles.actions}>
            {pending ? (
              // Both buttons go at once: the row is mid-decision, and leaving
              // the other one tappable would let a reject chase an approve.
              <ActivityIndicator size="small" color="#007bff" />
            ) : (
              <>
                <TouchableOpacity onPress={() => onRespond(item.id, 'approve')}>
                  <Ionicons name="checkmark-circle" size={28} color="#28a745" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onRespond(item.id, 'reject')}>
                  <Ionicons name="close-circle" size={28} color="#dc3545" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </Card>
      );

    case 'notification':
      return (
        <Card highlighted={item.status === 'sent'}>
          <Message>
            <Text style={styles.messageText}>{formatNotification(item)}</Text>
            <Text style={styles.emailText}>
              {new Date(item.created_at).toLocaleString()}
            </Text>
          </Message>
        </Card>
      );

    default:
      return null;
  }
};

const Card = ({highlighted, children}) => (
  <View
    style={[styles.notificationCard, highlighted && styles.sentNotificationCard]}>
    <View style={styles.notificationRow}>{children}</View>
  </View>
);

const Message = ({children}) => (
  <View style={styles.messageContainer}>{children}</View>
);

export default NotificationRow;
