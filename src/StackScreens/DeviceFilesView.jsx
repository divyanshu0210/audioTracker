import React, {useMemo} from 'react';
import {SectionList, StyleSheet, Text, View} from 'react-native';
import {useAppState} from '../contexts/AppStateContext';
import DeviceItem from './DeviceItem';
import {groupItemsByDate} from './utils/grouppByDate';
import BaseMediaListComponent from './BaseMediaListComponent';
import {ItemTypes} from '../contexts/constants';
import {useMediaStore} from '../stores/useMediaStore';
import useLoadingStore from '../stores/useLoadingStore';

const DeviceFilesView = ({onRefresh}) => {
  const emptyText = 'Press + to Add Media from device';
  const data = useMediaStore(state => state.validDeviceFiles);
  const loading = useLoadingStore(state => state.loadingStates.device);
  

  const memoizedData = useMemo(() => data, [data]);

  return (
    <BaseMediaListComponent
      mediaList={memoizedData}
      emptyText={emptyText}
      onRefresh={onRefresh}
      loading={loading}
      type={ItemTypes.DEVICE}
    />
  );
};

const styles = StyleSheet.create({});

export default React.memo(DeviceFilesView);
