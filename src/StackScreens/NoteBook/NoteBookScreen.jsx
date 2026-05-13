import React from 'react';
import {useAppState} from '../../contexts/AppStateContext';
import {ItemTypes} from '../../contexts/constants';
import BaseMediaListComponent from '../BaseMediaListComponent';
import NotebookItem from './NotebookItem';
import { useNotesStore } from '../../stores/useNotesStore';
import useAppStateStore from '../../contexts/appStateStore';

export default function NotebookScreen({onRefresh}) {
  const emptyText = 'Press + to add NoteBooks';
    const data = useNotesStore(state => state.notebooks);
       const loading = useAppStateStore(state => state.homeTabLoading);
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
