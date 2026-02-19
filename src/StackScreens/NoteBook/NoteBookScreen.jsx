import React from 'react';
import {useAppState} from '../../contexts/AppStateContext';
import {ItemTypes} from '../../contexts/constants';
import BaseMediaListComponent from '../BaseMediaListComponent';
import NotebookItem from './NotebookItem';

export default function NotebookScreen({data, onRefresh, loading}) {
  const emptyText = 'Press + to add NoteBooks';
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
