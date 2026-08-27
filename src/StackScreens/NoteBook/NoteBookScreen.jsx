import React, {useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {useAppState} from '../../contexts/AppStateContext';
import {ItemTypes} from '../../contexts/constants';
import BaseMediaListComponent from '../BaseMediaListComponent';
import NotebookItem from './NotebookItem';
import {useNotesStore} from '../../stores/useNotesStore';
import useLoadingStore from '../../stores/useLoadingStore';

export default function NotebookScreen({onRefresh}) {
  const emptyText = 'Press + to add NoteBooks';
  const data = useNotesStore(state => state.notebooks);
  const refreshNotebookCounts = useNotesStore(
    state => state.refreshNotebookCounts,
  );
  const loading = useLoadingStore(state => state.loadingStates.notebooks);

  // Per-notebook note counts only have to be right while this list is on
  // screen, and every way a note changes notebook (create, delete, move,
  // deleting a notebook but keeping its notes) happens elsewhere. Recounting
  // on focus keeps this to one call site that can't go stale, instead of
  // threading an invalidation through each of those paths.
  useFocusEffect(
    useCallback(() => {
      refreshNotebookCounts();
    }, [refreshNotebookCounts]),
  );
  return (
    <BaseMediaListComponent
      mediaList={data}
      emptyText={emptyText}
      onRefresh={onRefresh}
      loading={loading}
      type={ItemTypes.NOTEBOOK}
    />
  );
}
