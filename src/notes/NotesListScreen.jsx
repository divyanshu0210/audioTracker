import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import React from 'react';
import ItemNotesScreen from './ItemNotesList';
import ContextHeader from '../components/headers/ContextHeader';
import useInMenteeCategory from '../appMentor/useInMenteeCategory';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
import {useMenteeNotesStore} from '../appMentor/menteeNotesSync';

// The same screen for an item's notes either way. Opened from inside a mentee's
// category it reads what the mentee wrote about this lecture; anywhere else it
// is what it has always been, this user's own notes.
//
// Asked of the store rather than carried in from the tap, because neither half
// of the answer can move while this screen is up: the only thing that sets a
// mentee is MentorMenteeDrawer, which lives in MainHeader, and MainHeader is
// inside MainApp - a sibling of this screen in the root stack, and covered by
// it. The category dropdown that sets the other half is in the same header.
const NotesListScreen = () => {
  const inMenteeCategory = useInMenteeCategory();
  const mentee = useMentorMenteeStore(state => state.activeMentee);

  const menteeId = inMenteeCategory ? mentee?.id ?? null : null;
  const menteeName = menteeId ? mentee.full_name || mentee.email : null;

  const syncing = useMenteeNotesStore(state => state.syncing);

  return (
    <View style={{flex: 1}}>
      <ContextHeader menteeName={menteeName} />
      {/* A first sync is a whole backup being fetched. An empty list while one
          runs reads as "they have written nothing about this", which is a
          different answer and the wrong one. */}
      {!!menteeId && syncing && (
        <View style={styles.syncRow}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.syncText}>Fetching their notes...</Text>
        </View>
      )}
      <ItemNotesScreen menteeId={menteeId} />
    </View>
  );
};

export default NotesListScreen;

const styles = StyleSheet.create({
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  syncText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#666',
  },
});
