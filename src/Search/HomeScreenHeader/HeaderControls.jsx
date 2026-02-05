import React, {useState} from 'react';
import {View, TouchableOpacity, StyleSheet} from 'react-native';
import SearchComponent from './SearchComponent';
import UniversalFilterBar from './UniversalFilterBar';
import {useAppState} from '../../contexts/AppStateContext';
import {useNavigation} from '@react-navigation/core';

const HeaderControls = ({
  showSearch,
  setShowSearch,
  results,
  setResults,
  noteResults,
  setNoteResults,
  loadingSearch,
  setLoadingSearch,
}) => {
  const [activeFilters, setActiveFilters] = useState(['all']);
  const [activeNoteFilters, setActiveNoteFilters] = useState(['all_notes']);
  const [showNoteFilters, setShowNoteFilters] = useState(false);

  return (
    <View style={styles.headerRow}>

      <View style={{flexDirection: 'column', gap: 10}}>
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
    </View>
  );
};

export default HeaderControls;

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-between',
    
  },
  iconButton: {
    padding: 5,
    borderRadius: 50,
    position: 'relative',
  },
});
