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
  // Every device file, not just the ones whose bytes are still on disk.
  // A restore brings back rows without their files, and hiding those made
  // them look deleted when they are recoverable — the shared Drive copy is
  // still there. They are listed with a warning badge instead, and the row
  // says what to do about it.
  //
  // The queue is playableDeviceFiles, which is a wider list than the on-disk
  // one: a file that cannot be played has no business being queued, but a
  // missing file with a copy in Drive can be played — it streams.
  const data = useMediaStore(state => state.deviceFiles);
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
