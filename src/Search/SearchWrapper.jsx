// components/SearchWrapper.js
import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  StyleSheet,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import SearchComponent from './SearchComponent';
import SearchResultsList from './SearchResultsList';
import UniversalFilterBar from './UniversalFilterBar';
import {useRoute} from '@react-navigation/core';

const SearchWrapper = () => {
  const {params} = useRoute();

  const mode = params?.mode ?? 'all';
  const initialActiveFilters = params?.initialActiveFilters ?? ['all'];
  const initialNoteFilters = params?.initialNoteFilters ?? ['all_notes'];
  const initialSearchActive = params?.initialSearchActive ?? false;
  const sourceId = params?.sourceId ?? null;
  const categoryId = params?.categoryId ?? null;
  const title = params?.title ;
  

  const [showSearch, setShowSearch] = useState(initialSearchActive);
  const [results, setResults] = useState([]);
  const [noteResults, setNoteResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [activeFilters, setActiveFilters] = useState(initialActiveFilters);
  const [activeNoteFilters, setActiveNoteFilters] =
    useState(initialNoteFilters);

  const [showNoteFilters, setShowNoteFilters] = useState(false);

  const hideFilters = useMemo(() => {
    const hasCustomItemFilters = !(
      initialActiveFilters.length === 1 && initialActiveFilters[0] === 'all'
    );

    const hasCustomNoteFilters = !(
      initialNoteFilters.length === 1 && initialNoteFilters[0] === 'all_notes'
    );

    return hasCustomItemFilters || hasCustomNoteFilters;
  }, [initialActiveFilters, initialNoteFilters]);

  useEffect(() => {
    setActiveFilters(initialActiveFilters);
    setActiveNoteFilters(initialNoteFilters);
  }, [initialActiveFilters?.join(','), initialNoteFilters?.join(',')]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <View style={styles.header}>
          <SearchComponent
            mode={mode}
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
            sourceId={sourceId}
            categoryId={categoryId}
            title={title}
          />

          {showSearch && !hideFilters && (
            <UniversalFilterBar
              mode={mode}
              activeFilters={activeFilters}
              setActiveFilters={setActiveFilters}
              activeNoteFilters={activeNoteFilters}
              setActiveNoteFilters={setActiveNoteFilters}
              showNoteFilters={showNoteFilters}
            />
          )}
        </View>

        {/* 🔹 CONTENT */}
        {showSearch && (
          <View style={styles.resultsContainer}>
            <SearchResultsList
              results={results}
              noteResults={noteResults}
              loadingSearch={loadingSearch}
            />
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

export default SearchWrapper;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  resultsContainer: {
    flex: 1,
  },
});
