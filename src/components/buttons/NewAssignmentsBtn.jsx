// NewAssignmentsBtn.jsx
//
// The pill at the top of the home screen: what the assignment sync is doing,
// and how many things are waiting.
//
// It no longer runs the sync. That happens on its own when the app opens (see
// syncAssignmentsOnStartup), because this pill's only job now is to open the
// mentor list — and a count that is still being worked out when someone taps
// is worse than no pill at all.
//
// Assigned items are filed under the mentor who sent them rather than joining
// the mentee's own tabs, so the mentor list is where they actually are. That
// is where the tap goes.

import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import React from 'react';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import useMentorMenteeStore from '../../appMentor/useMentorMenteeStore';
import useAssignmentInboxStore from '../../appMentor/useAssignmentInboxStore';

const NewAssignmentsBtn = () => {
  const setDrawerVisible = useMentorMenteeStore(
    state => state.setDrawerVisible,
  );
  const isSyncing = useAssignmentInboxStore(state => state.isSyncing);
  const unreadByMentor = useAssignmentInboxStore(
    state => state.unreadByMentor,
  );

  const total = Object.values(unreadByMentor).reduce(
    (sum, count) => sum + count,
    0,
  );

  // Nothing to say: no sync running and nothing waiting.
  if (!isSyncing && total === 0) return null;

  // Tappable even mid-sync — the drawer is a fine place to wait, and the
  // badges fill in behind it as the sync lands.
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={() => setDrawerVisible(true)}>
        {isSyncing ? (
          <>
            <ActivityIndicator size="small" color="#0066cc" style={styles.spinner} />
            <Text style={styles.text}>Checking for new assignments…</Text>
          </>
        ) : (
          <>
            <Text style={styles.text}>
              {total} new {total === 1 ? 'assignment' : 'assignments'}
            </Text>
            <MaterialIcons name="chevron-right" size={20} color="#0066cc" />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default NewAssignmentsBtn;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    zIndex: 1000,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0ff',
    borderColor: '#0066cc',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  spinner: {
    marginRight: 8,
  },
  text: {
    color: '#0066cc',
    fontWeight: '600',
    fontSize: 14,
  },
});
