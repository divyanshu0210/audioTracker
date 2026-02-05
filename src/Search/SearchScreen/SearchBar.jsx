import React, {useRef, useState, useEffect} from 'react';
import {Animated, TextInput, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';

const SearchBar = ({
    handleSearch,
  onToggle,
  initialQuery = '',
  isVisible = false,
  setNotesList,
  sourceType,
  fileType

}) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const searchBarWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isVisible) {
      Animated.timing(searchBarWidth, {
        toValue: 350,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(searchBarWidth, {
        toValue: 0,
        duration: 0,
        useNativeDriver: false,
      }).start();
    }
  }, [isVisible, searchBarWidth]);

  const handleSearchChange = text => {
    setSearchQuery(text); // Ensure state updates
    // if (text.trim()) {
      handleSearch(text,sourceType,fileType);
    //   handleSearch(text, sourceType);
    // }
    // else{
        // setNotesList([])
    // }
  };

  return (
    <Animated.View style={[styles.searchContainer, {width: searchBarWidth}]}>
      <TouchableOpacity onPress={onToggle} style={styles.iconButton}>
        <MaterialIcons name={isVisible ? 'arrow-back' : 'search'} size={24} color="gray" />
      </TouchableOpacity>
      {isVisible && (
        <TextInput
          style={styles.searchInput}
          placeholder="Search notes..."
          placeholderTextColor='#888'
          autoFocus={true}
          value={searchQuery}
          onChangeText={handleSearchChange}
          returnKeyType="search"
        />
      )}
    </Animated.View>
  );
};

const styles = {
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 50,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  iconButton: {
    padding: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color:'#000'
  },
};

export default SearchBar;