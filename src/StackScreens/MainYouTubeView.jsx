import React from 'react';
import {SectionList, StyleSheet, Text, View} from 'react-native';
import {useAppState} from '../contexts/AppStateContext';
import {groupItemsByDate} from './utils/grouppByDate';
import YouTubeItem from './YouTubeItem';
import BaseMediaListComponent from './BaseMediaListComponent';
import {ItemTypes, ScreenTypes} from '../contexts/constants';

export default function MainScreen({onRefresh, loading}) {
  const {items} = useAppState();

  const renderItem = ({item}) => <YouTubeItem item={item} />;
  const emptyText = '  Press + to Add Videos/Playlists using YouTube Links';

  return (
    <BaseMediaListComponent
      mediaList={items}
      emptyText={emptyText}
      onRefresh={onRefresh}
      loading={loading}
      type={ItemTypes.YOUTUBE}
      screen={ScreenTypes.MAIN}
    />
  );
}

const styles = StyleSheet.create({});
