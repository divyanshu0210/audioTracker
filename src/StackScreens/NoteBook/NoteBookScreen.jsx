import React from 'react';
import { useAppState } from '../../contexts/AppStateContext';
import { ItemTypes } from '../../contexts/constants';
import BaseMediaListComponent from '../BaseMediaListComponent';
import NotebookItem from './NotebookItem';

export default function NotebookScreen({onRefresh, loading}) {
  const {notebooks} = useAppState();

  const renderItem = ({item}) => <NotebookItem item={item} />;
  const emptyText = 'Press + to add NoteBooks';


  return (
    <BaseMediaListComponent
      mediaList={notebooks}
      emptyText={emptyText}
      onRefresh={onRefresh}
      loading={loading}
      type={ItemTypes.NOTEBOOK}
    />
  );
}
