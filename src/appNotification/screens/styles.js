import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  notificationCard: {
    // marginHorizontal: 12,
    marginVertical: 2,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#ffffff',

  },
  sentNotificationCard: {
    backgroundColor: '#e6f0ff', // LinkedIn-style highlight
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  messageContainer: {
    flex: 1,
  },
  messageText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  emailText: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
  },
  emptyText: {
    color: '#777',
    textAlign: 'center',
    marginTop: 30,
    fontSize: 15,
  },
});
