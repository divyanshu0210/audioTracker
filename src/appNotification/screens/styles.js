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
  // Was inline on the received-request row; shared now that one component
  // renders every kind.
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginLeft: 8,
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
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 6,
  },
  emptyText: {
    color: '#777',
    textAlign: 'center',
    marginTop: 30,
    fontSize: 15,
  },
});
