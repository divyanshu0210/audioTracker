import React, {useMemo} from 'react';
import BaseMediaListComponent from './BaseMediaListComponent';
import {ItemTypes, ScreenTypes} from '../contexts/constants';
import {useMediaStore} from '../stores/useMediaStore';
import useLoadingStore from '../stores/useLoadingStore';
import YouTubeSearchBar from '../Search/YouTube/YouTubeSearchBar';

const MainScreen = ({onRefresh}) => {
  const emptyText = '  Press + to Add Videos/Playlists using YouTube Links';
  const data = useMediaStore(state => state.items);
  const loading = useLoadingStore(state => state.loadingStates.youtube);
  const memoizedData = useMemo(() => data, [data]);

  return (
    <BaseMediaListComponent
      mediaList={memoizedData}
      emptyText={emptyText}
      onRefresh={onRefresh}
      loading={loading}
      type={ItemTypes.YOUTUBE}
      screen={ScreenTypes.MAIN}
      listHeaderComponent={<YouTubeSearchBar />}
    />
  );
}

export default React.memo(MainScreen);
