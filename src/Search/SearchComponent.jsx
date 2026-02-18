// components/SearchComponent.js
import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { fetchNotes } from '../database/R';
import { searchAllTables } from './searchUtils';

const NOTE_FILTER_TO_SOURCE_TYPE = {
  youtube_notes: 'youtube_video',
  drive_notes: 'drive_file',
  notebook_notes: 'notebook',
  device_notes: 'device_file',
};

const SearchComponent = ({
  mode = 'all',
  showSearch,
  setShowSearch,
  setResults,
  setNoteResults,
  setLoadingSearch,
  activeFilters,
  setActiveFilters,
  activeNoteFilters,
  setActiveNoteFilters,
  setShowNoteFilters,
  sourceId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const widthAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef(null);

  // 🔵 Animation Logic (UNCHANGED)
  useEffect(() => {
    const toValue = showSearch ? 1 : 0;

    Animated.timing(widthAnim, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();

    if (showSearch) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearchQuery('');
      setResults([]);
      setNoteResults([]);
      setActiveFilters(['all']);
      setActiveNoteFilters(['all_notes']);
      setShowNoteFilters(false);
    }
  }, [showSearch]);

  // 🔵 Debounce + Mode-aware Search
  useEffect(() => {
    const trimmed = searchQuery.trim();

    if (mode === 'all') {
      setShowNoteFilters(activeFilters.includes('notes'));
    } else if (mode === 'notes') {
      setShowNoteFilters(true);
    } else {
      setShowNoteFilters(false);
    }

    if (!trimmed && mode === 'all') {
      setResults([]);
      setNoteResults([]);
      return;
    }

    const delay = setTimeout(() => {
      handleSearch(trimmed);
    }, 300);

    return () => clearTimeout(delay);
  }, [searchQuery, activeFilters, activeNoteFilters, mode]);

  const handleSearch = async text => {
    setLoadingSearch(true);

    try {
      if (mode === 'items') {
        const data = await searchAllTables(text, activeFilters,sourceId);
        setResults(data);
        setNoteResults([]);
      } else if (mode === 'notes') {
        const notes = await searchNotes(text);
        setResults([]);
        setNoteResults(notes);
      } else {
        const [items, notes] = await Promise.all([
          searchAllTables(text, activeFilters,sourceId),
          searchNotes(text),
        ]);

        setResults(items);
        setNoteResults(notes);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
      setNoteResults([]);
    } finally {
      setLoadingSearch(false);
    }
  };

  const searchNotes = async text => {
    const filters = activeNoteFilters.includes('all_notes')
      ? Object.keys(NOTE_FILTER_TO_SOURCE_TYPE)
      : activeNoteFilters;

    const noteData = [];

    for (const key of filters) {
      const sourceType = NOTE_FILTER_TO_SOURCE_TYPE[key];
      if (!sourceType) continue;
      const params = {
        offset: 0,
        limit: 20,
        sortBy: 'n.created_at',
        sortOrder: 'DESC',
        sourceType,
        searchQuery: text,
      };
      if (sourceId != null) {
        // checks for both null and undefined
        params.sourceId = sourceId;
      }
      const results = await fetchNotes(params);

      noteData.push(...results);
    }

    return noteData;
  };

  const animatedWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Animated.View
          style={[
            styles.searchBar,
            {width: animatedWidth, opacity: widthAnim},
          ]}>
          <View style={styles.searchInputContainer}>
            <Icon name="search" size={20} color="#666" />
            <TextInput
              ref={inputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search..."
              style={styles.input}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Icon name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  searchBar: {
    backgroundColor: '#f1f3f4', // Matches searchContainer background in MentorMenteeDrawer
    borderRadius: 12,
    overflow: 'hidden',
    height: 44,
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    height: '100%',
    fontFamily: 'Roboto', // Consistent typography
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff', // Matches selectionButton background
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
});

export default SearchComponent;
