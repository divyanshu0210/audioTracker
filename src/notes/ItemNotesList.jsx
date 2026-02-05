// screens/ItemNotesScreen.js
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import {fetchNotes} from '../database/R';
import NotesListComponent from './notesListing/NotesListComponent';
import {useAppState} from '../contexts/AppStateContext';
import { ScreenTypes } from '../contexts/constants';

const ItemNotesScreen = ({useSpecial}) => {
  const {activeItem, setNotesList} = useAppState();
  const [loading, setLoading] = useState(false);

  const sourceId = activeItem?.sourceId;
  const sourceType = activeItem?.sourceType;

  useEffect(() => {
    if (sourceId && sourceType) {
      loadNotesForItem();
    }
  }, [activeItem]);

  const loadNotesForItem = async () => {
    setLoading(true);
    try {
      const notes = await fetchNotes({
        offset: 0,
        limit: 1000, // get everything for the item
        sortBy: 'created_at',
        sortOrder: 'DESC',
        sourceId,
        sourceType,
      });
      setNotesList(notes);
    } catch (error) {
      console.error('Error loading notes for item:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <ActivityIndicator size="small" color="#0000ff" style={{marginTop: 20}} />
      ) : (
        <NotesListComponent
          loading={loading}
          useSpecial={useSpecial}
          screen={ScreenTypes.IN}
        />
      )}
    </SafeAreaView>
  );
};

export default ItemNotesScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
