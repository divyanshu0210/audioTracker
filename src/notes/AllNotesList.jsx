import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, SafeAreaView, StyleSheet, unstable_batchedUpdates} from 'react-native';
import NotesListComponent from './notesListing/NotesListComponent';
import {useAppState} from '../contexts/AppStateContext';
import {ScreenTypes} from '../contexts/constants';
import {fetchNotes} from '../database/R';
import {useNotesStore} from '../stores/useNotesStore';
import useLoadingStore from '../stores/useLoadingStore';

const AllNotesScreen = ({categoryId}) => {
  const setMainNotesList = useNotesStore(state => state.setMainNotesList);

  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);

  const setLoadingState = useLoadingStore(state => state.setLoadingState);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData,categoryId]);

  const loadInitialData = useCallback(async () => {
    unstable_batchedUpdates(() => {
      setMainNotesList([]);
      setLoadingState('mainNotes', true);
    });
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
        hasMoreRef.current = notes.length === limit;
      }
      setMainNotesList(notes);
    } catch (error) {
      console.error('Error loading initial notes:', error);
    } finally {
      setLoadingState('mainNotes', false);
    }
  }, [categoryId]);

  const loadMoreData = useCallback(async () => {
    const loading = useLoadingStore.getState().loadingStates.mainNotes;
    const loadingMore = useLoadingStore.getState().loadingStates.mainMoreNotes;
    if (loading || loadingMore || !hasMoreRef.current || categoryId) return;

    setLoadingState('mainMoreNotes', true);
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
      setLoadingState('mainMoreNotes', false);
    }
  }, [categoryId]);

  return (
    <SafeAreaView style={styles.container}>
      <NotesListComponent
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
