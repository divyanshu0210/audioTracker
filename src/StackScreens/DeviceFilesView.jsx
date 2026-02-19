import React from 'react';
import {SectionList, StyleSheet, Text, View} from 'react-native';
import {useAppState} from '../contexts/AppStateContext';
import DeviceItem from './DeviceItem';
import {groupItemsByDate} from './utils/grouppByDate';
import BaseMediaListComponent from './BaseMediaListComponent';
import {ItemTypes} from '../contexts/constants';

const DeviceFilesView = ({data,onRefresh, loading}) => {
  const emptyText = 'Press + to Add Media from device';

  return (
    <BaseMediaListComponent
      mediaList={data}
      emptyText={emptyText}
      onRefresh={onRefresh}
      loading={loading}
      type={ItemTypes.DEVICE}
    />
  );
};

const styles = StyleSheet.create({});

export default DeviceFilesView;
