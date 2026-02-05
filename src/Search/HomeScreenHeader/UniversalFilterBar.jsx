// components/FilterBar.js
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

const UniversalFilterBar = ({
  activeFilters,
  setActiveFilters,
  activeNoteFilters,
  setActiveNoteFilters,
  showNoteFilters,
}) => {
  const PRIMARY_FILTERS = [
    {label: 'All', key: 'all'},
    {label: 'Folder', key: 'folders'},
    {label: 'Drive', key: 'files'}, //THIS IS TABLE NAME DONT CHANGE
    {label: 'Device', key: 'device_files'},
    {label: 'Youtube', key: 'videos'},
    {label: 'Playlist', key: 'playlists'},
    {label: 'Notebook', key: 'notebooks'},
    {label: 'Notes', key: 'notes'},
  ];

  const NOTE_FILTERS = [
    {label: 'All Notes', key: 'all_notes'},
    {label: 'YouTube Notes', key: 'youtube_notes'},
    {label: 'Drive Notes', key: 'drive_notes'},
    {label: 'Notebook Notes', key: 'notebook_notes'},
  ];

  const handleFilterToggle = key => {
    let updatedFilters = [...activeFilters];

    if (key === 'all') {
      updatedFilters = ['all'];
      setActiveNoteFilters(['all_notes']);
    } else if (key === 'notes') {
      const isNotesActive = activeFilters.includes('notes');
      updatedFilters = isNotesActive
        ? activeFilters.filter(f => f !== 'notes')
        : [...activeFilters.filter(f => f !== 'all'), 'notes'];

      if (isNotesActive && updatedFilters.length === 0) {
        updatedFilters = ['all'];
        setActiveNoteFilters(['all_notes']);
      }
    } else {
      const isActive = activeFilters.includes(key);
      updatedFilters = isActive
        ? activeFilters.filter(f => f !== key)
        : [...activeFilters.filter(f => f !== 'all'), key];

      if (updatedFilters.length === 0) {
        updatedFilters = ['all'];
        setActiveNoteFilters(['all_notes']);
      }
    }

    setActiveFilters(updatedFilters);
  };

  const handleNoteFilterToggle = key => {
    setActiveNoteFilters([key]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {PRIMARY_FILTERS.map(({label, key}) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.filterBtn,
              activeFilters.includes(key) && styles.activeFilterBtn,
            ]}
            onPress={() => handleFilterToggle(key)}>
            <Text
              style={[
                styles.filterText,
                activeFilters.includes(key) && styles.activeFilterText,
              ]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {showNoteFilters && (
        <View style={styles.filterRow}>
          {NOTE_FILTERS.map(({label, key}) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterBtn,
                activeNoteFilters.includes(key) && styles.activeFilterBtn,
              ]}
              onPress={() => handleNoteFilterToggle(key)}>
              <Text
                style={[
                  styles.filterText,
                  activeNoteFilters.includes(key) && styles.activeFilterText,
                ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // flex:1,
    paddingTop: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: 5,
  },

  filterBtn: {
   paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f1f3f4', // Matches SearchComponent searchBar
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  activeFilterBtn: {
    backgroundColor: '#1a73e8', // Google Blue, matches MentorMenteeDrawer
    borderColor: '#1a73e8',
  },
  filterText: {
     fontSize: 14,
    color: '#333',
    fontFamily: 'Roboto', // Matches SearchComponent and MentorMenteeDrawer
  },
  activeFilterText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default UniversalFilterBar;
