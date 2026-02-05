import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import NotesListComponent from './notesListing/NotesListComponent';
import {useAppState} from '../contexts/AppStateContext';
import {ScreenTypes} from '../contexts/constants';
import { fetchNotesInCategory } from '../categories/catDB';
import { fetchNotes } from '../database/R';

const AllNotesScreen = () => {
  const {setMainNotesList, selectedCategory} = useAppState();

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, [selectedCategory]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const limit = 20;
      let notes = [];

      if (selectedCategory) {
        notes = await fetchNotesInCategory(selectedCategory);
      } else {
        notes = await fetchNotes({
          offset: 0,
          limit,
          sortBy: 'created_at',
          sortOrder: 'DESC',
        });
        setOffset(notes.length);
        setHasMore(notes.length === limit);
      }

      setMainNotesList(notes);
    } catch (error) {
      console.error('Error loading initial notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreData = async () => {
    if (loading || loadingMore || !hasMore || selectedCategory) return;

    setLoadingMore(true);
    try {
      const limit = 20;
      const newNotes = await fetchNotes({
        offset,
        limit,
        sortBy: 'created_at',
        sortOrder: 'DESC',
      });
      setMainNotesList(prev => [...prev, ...newNotes]);
      setOffset(prev => prev + newNotes.length);
      setHasMore(newNotes.length === limit);
    } catch (error) {
      console.error('Error loading more notes:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <NotesListComponent
        loading={loading}
        loadingMore={loadingMore}
        loadInitialData={loadInitialData}
        loadMoreData={loadMoreData}
        screen={ScreenTypes.MAIN}
      />
    </SafeAreaView>
  );
};

export default AllNotesScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
