// components/SearchWrapper.js
import React, {useState} from 'react';
import {View, TouchableOpacity, StyleSheet, Animated, Keyboard} from 'react-native';
import SearchComponent from './SearchComponent';
import SearchResultsList from './SearchResultsList';
import {useAppState} from '../../contexts/AppStateContext';
import UniversalFilterBar from './UniversalFilterBar';
import NotificationButton from '../../appNotification/components/NotificationButton';
import {useNavigation, useRoute} from '@react-navigation/core';

const SearchWrapper = ({}) => {
  const {params} = useRoute();
  const initialSearchActive = params?.initialSearchActive ?? false;
  const [showSearch, setShowSearch] = useState(initialSearchActive);
  const [results, setResults] = useState([]);
  const [noteResults, setNoteResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [headerHeight, setHeaderHeight] = useState(0);

  const [activeFilters, setActiveFilters] = useState(['all']);
  const [activeNoteFilters, setActiveNoteFilters] = useState(['all_notes']);
  const [showNoteFilters, setShowNoteFilters] = useState(false);

  return (
    <>
      <View
        style={styles.customHeader}
        onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}>
        <View style={styles.headerRow}>
          <View style={{flexDirection: 'row', gap: 10}}>
            <SearchComponent
              showSearch={showSearch}
              setShowSearch={setShowSearch}
              setResults={setResults}
              setNoteResults={setNoteResults}
              setLoadingSearch={setLoadingSearch}
              activeFilters={activeFilters}
              setActiveFilters={setActiveFilters}
              activeNoteFilters={activeNoteFilters}
              setActiveNoteFilters={setActiveNoteFilters}
              setShowNoteFilters={setShowNoteFilters}
            />
          </View>
        </View>
        {showSearch && (
          <UniversalFilterBar
            activeFilters={activeFilters}
            setActiveFilters={setActiveFilters}
            activeNoteFilters={activeNoteFilters}
            setActiveNoteFilters={setActiveNoteFilters}
            showNoteFilters={showNoteFilters}
          />
        )}
      </View>

      {/* Search Results */}
      <SearchResultsList
        results={results}
        noteResults={noteResults}
        setNoteResults={setNoteResults}
        setResults={setResults}
        setShowSearch={setShowSearch}
        headerHeight={headerHeight}
        loadingSearch={loadingSearch}
      />

      {/* Overlay */}
      {showSearch && (
        <View style={[styles.overlayWrapper, {top: headerHeight}]}>
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => {
              // const noResults =
              //   results.length === 0 && noteResults.length === 0;

                
              //   if (noResults) {
              //   setShowSearch(false);
              //   navigation.goBack();
              // }

              // setResults([]);
              // setNoteResults([]);
              Keyboard.dismiss()
            }}
          />
        </View>
      )}
    </>
  );
};

export default SearchWrapper;

const styles = StyleSheet.create({
  customHeader: {
    // flex:1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    // backgroundColor: '#0F56B3',
    borderBottomWidth: 1,
     backgroundColor: '#F8F9FA',
    borderBottomColor: '#E0E0E0',


    zIndex: 2,
  },
  headerRow: {
    // flex:1,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-between',
  },
  overlayWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    // backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
