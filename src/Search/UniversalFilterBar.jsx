// components/UniversalFilterBar.js
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

const PRIMARY_FILTERS = [
  {label: 'All', key: 'all'},
  {label: 'Drive Folder', key: 'drive_folder'},
  {label: 'Drive File', key: 'drive_file'},
  {label: 'Device File', key: 'device_file'},
  {label: 'Youtube Video', key: 'youtube_video'},
  {label: 'Youtube Playlist', key: 'youtube_playlist'},
  {label: 'Notebook', key: 'notebook'},
  {label: 'Notes', key: 'notes'},
];

const NOTE_FILTERS = [
  {label: 'All Notes', key: 'all_notes'},
  {label: 'YouTube Notes', key: 'youtube_notes'},
  {label: 'Drive Notes', key: 'drive_notes'},
  {label: 'Notebook Notes', key: 'notebook_notes'},
  {label: 'Device Notes', key: 'device_notes'},
];

const UniversalFilterBar = ({
  mode = 'all', 
  activeFilters,
  setActiveFilters,
  activeNoteFilters,
  setActiveNoteFilters,
  showNoteFilters,
}) => {

  const handleFilterToggle = key => {
    let updatedFilters = [...activeFilters];

    if (key === 'all') {
      updatedFilters = ['all'];
      setActiveNoteFilters(['all_notes']);
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

  const showPrimary =
    mode === 'all' || mode === 'items';

  const showNotes =
    mode === 'notes'
      ? true
      : mode === 'all' && showNoteFilters;

  return (
    <View style={styles.filterContainer}>

      {showPrimary && (
        <View style={styles.filterRow}>
          {PRIMARY_FILTERS
            .filter(f => mode !== 'items' || f.key !== 'notes')
            .map(({label, key}) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.filterButton,
                  activeFilters.includes(key) && styles.activeFilter,
                ]}
                onPress={() => handleFilterToggle(key)}
              >
                <Text
                  style={[
                    styles.filterText,
                    activeFilters.includes(key) && {color: 'white'},
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
        </View>
      )}

      {showNotes && (
        <View style={styles.filterRow}>
          {NOTE_FILTERS.map(({label, key}) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterButton,
                activeNoteFilters.includes(key) && styles.activeFilter,
              ]}
              onPress={() => handleNoteFilterToggle(key)}
            >
              <Text
                style={[
                  styles.filterText,
                  activeNoteFilters.includes(key) && {color: 'white'},
                ]}
              >
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
  filterContainer: {
    marginTop: 5,
    backgroundColor: '#F8F8F8',
    borderRadius: 5,
    paddingVertical: 4,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8, // slightly tighter than your original 6
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  filterButton: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: '#E0E0E0',
    borderRadius: 95, // ← strong capsule shape like original
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 68, // helps short labels look balanced
  },
  activeFilter: {
    backgroundColor: '#000',
  },
  filterText: {
    fontSize: 12, // ← matches original FilterBar
    color: 'black',
    fontWeight: '500',
  },
});
export default UniversalFilterBar;
