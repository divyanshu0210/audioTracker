// NewAssignmentsBtn.jsx
//
// The pill at the top of the home screen: how many assigned items are waiting.
//
// It does not run the sync, and it does not report on one. The sync happens on
// its own when the app opens (see syncAssignmentsOnStartup) and stays silent:
// a mentee who has nothing waiting has no reason to watch us look, and one who
// does will see the pill the moment the count lands. So the only state that
// reaches the screen is the count itself - no count, no pill.
//
// Assigned items are filed under the mentor who sent them rather than joining
// the mentee's own tabs, so the mentor list is where they actually are. That
// is where the tap goes.

import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import React from 'react';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import useMentorMenteeStore from '../../appMentor/useMentorMenteeStore';
import useAssignmentInboxStore from '../../appMentor/useAssignmentInboxStore';

const NewAssignmentsBtn = () => {
  const setDrawerVisible = useMentorMenteeStore(
    state => state.setDrawerVisible,
  );
  const unreadByMentor = useAssignmentInboxStore(
    state => state.unreadByMentor,
  );

  const total = Object.values(unreadByMentor).reduce(
    (sum, count) => sum + count,
    0,
  );

  // Nothing waiting: say nothing.
  if (total === 0) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={() => setDrawerVisible(true)}>
        <Text style={styles.text}>
          {total} new {total === 1 ? 'assignment' : 'assignments'}
        </Text>
        <MaterialIcons name="chevron-right" size={20} color="#0066cc" />
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
  text: {
    color: '#0066cc',
    fontWeight: '600',
    fontSize: 14,
  },
});
