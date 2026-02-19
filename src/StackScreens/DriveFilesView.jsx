import React from 'react';
import {SectionList, StyleSheet, Text, View} from 'react-native';
import {useAppState} from '../contexts/AppStateContext';
import DriveItem from './DriveItem';
import {groupItemsByDate} from './utils/grouppByDate';
import BaseMediaListComponent from './BaseMediaListComponent';
import {ItemTypes, ScreenTypes} from '../contexts/constants';

const DriveFilesView = ({data,onRefresh, loading}) => {
  const emptyText = 'Press + to Add Files using Drive Link';

  return (
    <BaseMediaListComponent
      mediaList={data}
      emptyText={emptyText}
      onRefresh={onRefresh}
      loading={loading}
      type={ItemTypes.DRIVE}
      screen={ScreenTypes.MAIN}
    />
  );
};

const styles = StyleSheet.create({});

export default DriveFilesView;
