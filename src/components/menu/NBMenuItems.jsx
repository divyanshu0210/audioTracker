import React from 'react';
import {View, Text, StyleSheet, Alert} from 'react-native';
import {MenuItem, MenuDivider} from 'react-native-material-menu';
import {deleteNotebook} from '../../database/D';
import {moveNotesToDefaultNotebook} from '../../database/C';
import {fetchNotebooks} from '../../database/R';
import {useNotesStore} from '../../stores/useNotesStore';
import {useShallow} from 'zustand/react/shallow';

const DEFAULT_NOTEBOOK_TITLE = 'Default Notebook';

const NBMenuItems = ({item, hideMenu}) => {
  const {
    setNotebooks,
    setEditingNotebook,
    removeNotesOfNotebook,
    reassignNotesOfNotebooks,
    upsertNotebook,
  } = useNotesStore(
    useShallow(state => ({
      setNotebooks: state.setNotebooks,
      setEditingNotebook: state.setEditingNotebook,
      removeNotesOfNotebook: state.removeNotesOfNotebook,
      reassignNotesOfNotebooks: state.reassignNotesOfNotebooks,
      upsertNotebook: state.upsertNotebook,
    })),
  );

  // The notebook list is re-read from the DB rather than filtered in place,
  // so a failed delete can't leave a stale row on screen.
  const refreshNotebooks = () => fetchNotebooks(setNotebooks);

  // deleteNotebook soft-deletes the notes in the DB, but mainNotesList (what
  // All Notes renders) would keep showing them until the next refetch — hence
  // removeNotesOfNotebook. Shared by both dialogs below.
  const deleteWithNotes = async () => {
    try {
      await deleteNotebook(item.id, {deleteNotes: true});
      removeNotesOfNotebook(item.id);
      refreshNotebooks();
    } catch (error) {
      console.error('Error deleting notebook and notes:', error);
    }
  };

  // The notes survive, so they can't just be dropped from All Notes the way
  // deleteWithNotes drops them — they have to be repointed at the Default
  // Notebook, or they keep rendering this notebook's name and colour.
  const deleteKeepingNotes = async () => {
    try {
      const defaultNotebook = await moveNotesToDefaultNotebook(item.id);
      await deleteNotebook(item.id, {deleteNotes: false});
      reassignNotesOfNotebooks([item.id], defaultNotebook);
      // The Default Notebook may have just been revived from soft-deleted by
      // moveNotesToDefaultNotebook. Put it on screen directly instead of
      // relying on the refetch below to notice — it now holds these notes, so
      // it must be reachable.
      upsertNotebook(defaultNotebook);
      refreshNotebooks();
    } catch (error) {
      console.error('Error moving notes or deleting notebook:', error);
    }
  };

  const confirmDelete = () => {
    // The Default Notebook is where every other notebook's notes get moved to,
    // so it has nowhere to hand them off — its only option is to take them
    // down with it.
    if (item.title === DEFAULT_NOTEBOOK_TITLE) {
      Alert.alert(
        'Delete Default Notebook',
        'This will delete All Notes in this Notebook',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Delete', style: 'destructive', onPress: deleteWithNotes},
        ],
      );
      return;
    }

    Alert.alert(
      'Delete Notebook',
      'Are you sure you want to delete?',
      [
        {
          text: 'Delete notebook and all notes',
          style: 'destructive',
          onPress: deleteWithNotes,
        },
        {text: 'Delete notebook, keep notes', onPress: deleteKeepingNotes},
        {text: 'Cancel', style: 'cancel'},
      ],
      {cancelable: true},
    );
  };

  return (
    <View>
      <MenuItem
        onPress={() => {
          hideMenu();
          setEditingNotebook(item);
        }}>
        <Text style={styles.menuItemText}>Edit</Text>
      </MenuItem>
      <MenuDivider />
      <MenuItem
        onPress={() => {
          confirmDelete();
          hideMenu();
        }}>
        <Text style={styles.menuItemText}>Delete</Text>
      </MenuItem>
    </View>
  );
};

export default NBMenuItems;

const styles = StyleSheet.create({
  menuItemText: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
  },
});
