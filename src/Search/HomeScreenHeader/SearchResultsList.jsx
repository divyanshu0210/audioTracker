// components/SearchResultsList.js
import React, {useMemo} from 'react';
import {View, ActivityIndicator} from 'react-native';
import BaseMediaListComponent from '../../StackScreens/BaseMediaListComponent';

const SearchResultsList = ({
  results = [],
  noteResults = [],
  loadingSearch,
}) => {

  const combinedData = useMemo(
    () => [...results, ...noteResults],
    [results, noteResults],
  );

  if (loadingSearch) {
    return (
      <View style={{padding: 20}}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (combinedData.length === 0) return null;

  return (
    <BaseMediaListComponent
      mediaList={combinedData}
      screen="search"
      emptyText="No results found"
    />
  );
};

export default SearchResultsList;
