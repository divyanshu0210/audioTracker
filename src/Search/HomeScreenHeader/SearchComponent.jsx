import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { fetchNotes } from '../../database/R.js';
import { searchAllTables } from './searchUtils.js';
import { useNavigation } from '@react-navigation/core';

const NOTE_FILTER_TO_SOURCE_TYPE = {
  youtube_notes: 'youtube',
  drive_notes: 'drive',
  notebook_notes: 'notebook',
};

const SearchComponent = ({
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
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const widthAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef(null);
  const navigation = useNavigation();

  useEffect(() => {
    const toValue = showSearch ? 1 : 0;

    Animated.timing(widthAnim, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();

    if (showSearch) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setSearchQuery('');
      setResults([]);
      setActiveFilters(['all']);
      setActiveNoteFilters(['all_notes']);
      setShowNoteFilters(false);
    }
  }, [showSearch]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    setShowNoteFilters(activeFilters.includes('notes'));

    if (!trimmed) {
      setResults([]);
      setNoteResults([]);
      return;
    }

    const delayDebounce = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch(searchQuery, activeFilters, activeNoteFilters);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, activeFilters, activeNoteFilters]);

  const handleSearch = async (
    text,
    filters = activeFilters,
    noteFilters = activeNoteFilters,
  ) => {
    setLoadingSearch(true);
    const trimmedText = text.trim();
    if (!trimmedText) {
      setNoteResults([]);
      setResults([]);
      return;
    }

    try {
      const noteData = [];
      const otherData = [];

      const promises = [];

      const nonNoteFilters = filters.filter(
        f => f !== 'notes' && !f.includes('_notes'),
      );
      if (nonNoteFilters.length > 0 || filters.includes('all')) {
        promises.push(
          searchAllTables(trimmedText, filters).then(data => {
            otherData.push(...data);
          }),
        );
      }

      if (
        filters.includes('all') ||
        filters.includes('notes') ||
        filters.some(f => f.includes('_notes'))
      ) {
        const relevantNoteFilters =
          filters.includes('all') || noteFilters.includes('all_notes')
            ? ['youtube_notes', 'drive_notes', 'notebook_notes']
            : noteFilters;

        for (const noteKey of relevantNoteFilters) {
          const sourceType = NOTE_FILTER_TO_SOURCE_TYPE[noteKey];
          if (!sourceType) continue;

          const params = {
            offset: 0,
            limit: 20,
            sortBy: 'created_at',
            sortOrder: 'DESC',
            sourceType,
            searchQuery: trimmedText,
          };

          promises.push(
            fetchNotes(params).then(results => {
              noteData.push(...results);
            }),
          );
        }
      }

      await Promise.all(promises);

      setNoteResults(noteData);
      setResults(otherData);
    } catch (err) {
      console.error('Search failed:', err);
      setNoteResults([]);
      setResults([]);
    } finally {
      setLoadingSearch(false);
    }
  };

  const animatedWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const animatedStyle = {
    width: animatedWidth,
    opacity: widthAnim,
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Animated.View style={[styles.searchBar, animatedStyle]}>
          <View style={styles.searchInputContainer}>
            <Icon
              name="search"
              size={20}
              color="#666"
              style={styles.searchIcon}
            />
            <TextInput
              ref={inputRef}
              value={searchQuery}
              onChangeText={text => setSearchQuery(text)}
              placeholder="Search notes, files, videos..."
              placeholderTextColor="#999"
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Search input"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Icon name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>

        {/* <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => {
            setShowSearch(!showSearch);
            navigation.goBack();
          }}
          activeOpacity={0.7}
          accessibilityLabel={showSearch ? 'Close search' : 'Open search'}
          accessibilityRole="button"
        >
          <Icon
            name={showSearch ? 'close' : 'search'}
            size={20}
            color="#333"
          />
        </TouchableOpacity> */}
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
    shadowOffset: { width: 0, height: 2 },
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
});

export default SearchComponent;