import React, {useMemo, useRef} from 'react';
import {SectionList, StyleSheet, Text, View} from 'react-native';
import {useAppState} from '../contexts/AppStateContext';
import DriveItem from './DriveItem';
import {groupItemsByDate} from './utils/grouppByDate';
import BaseMediaListComponent from './BaseMediaListComponent';
import {ItemTypes, ScreenTypes} from '../contexts/constants';
import {useMediaStore} from '../stores/useMediaStore';
import useLoadingStore from '../stores/useLoadingStore';

const DriveFilesView = ({onRefresh}) => {
  const emptyText = 'Press + to Add Files using Drive Link';
  const data = useMediaStore(state => state.driveLinksList);
  const loading = useLoadingStore(state => state.loadingStates.drive);

      const renderCount = useRef(0);
      renderCount.current++;
      console.log(
        `🎯 Render DRIVE FILEView #${renderCount.current}`,data.length
      );
  const memoizedData = useMemo(() => data, [data]);

  return (
    <BaseMediaListComponent
      mediaList={memoizedData}
      emptyText={emptyText}
      onRefresh={onRefresh}
      loading={loading}
      type={ItemTypes.DRIVE}
      screen={ScreenTypes.MAIN}
    />
  );
};

const styles = StyleSheet.create({});

export default React.memo(DriveFilesView);
