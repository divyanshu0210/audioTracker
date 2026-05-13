import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, SafeAreaView, StyleSheet} from 'react-native';
import NotesListComponent from './notesListing/NotesListComponent';
import {useAppState} from '../contexts/AppStateContext';
import {ScreenTypes} from '../contexts/constants';
import {fetchNotes} from '../database/R';
import {useNotesStore} from '../stores/useNotesStore';

const AllNotesScreen = ({categoryId}) => {
  const setMainNotesList = useNotesStore(state => state.setMainNotesList);

  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const limit = 20;
      let notes = [];

      if (categoryId) {
        notes = await fetchNotes({categoryId: categoryId});
      } else {
        notes = await fetchNotes({
          offset: 0,
          limit,
          sortBy: 'created_at',
          sortOrder: 'DESC',
        });
        offsetRef.current = notes.length;
        // setOffset(notes.length);
        hasMoreRef.current = notes.length === limit;
        // setHasMore(notes.length === limit);
      }

      setMainNotesList(notes);
    } catch (error) {
      console.error('Error loading initial notes:', error);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  const loadMoreData = useCallback(async () => {
    if (loading || loadingMore || !hasMoreRef.current || categoryId) return;
    // if (loading || loadingMore || !hasMore || categoryId) return;

    setLoadingMore(true);
    try {
      const limit = 20;
      const newNotes = await fetchNotes({
        offset: offsetRef.current,
        limit,
        sortBy: 'created_at',
        sortOrder: 'DESC',
      });
      setMainNotesList(prev => [...prev, ...newNotes]);
      const offprev = offsetRef.current;
      offsetRef.current = offprev + newNotes.length;
      // setOffset(prev => prev + newNotes.length);
      hasMoreRef.current = newNotes.length === limit;
      // setHasMore(newNotes.length === limit);
    } catch (error) {
      console.error('Error loading more notes:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [categoryId, loading, loadingMore]);

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

export default React.memo(AllNotesScreen);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
