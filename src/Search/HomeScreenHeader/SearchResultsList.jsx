// components/SearchResultsList.js
import React from 'react';
import {
  FlatList,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {isAudioOrVideo} from '../../Linking/utils/handleLinkSubmit';
import {getFolderStackFromDB} from '../../database/R';
import NotesListComponent from '../../notes/notesListing/NotesListComponent';
import {getPreviewText} from '../../notes/notesListing/NoteItem';
import {useNavigation} from '@react-navigation/core';
import {getItemId} from '../../StackScreens/BaseMediaListComponent';
import {ItemTypes} from '../../contexts/constants';
import {useAppState} from '../../contexts/AppStateContext';
import BaseItem from '../../StackScreens/BaseItem';

const SearchResultsList = ({
  results,
  setResults,
  noteResults,
  setNoteResults,
  setShowSearch,
  headerHeight,
  loadingSearch,
}) => {
  const navigation = useNavigation();
  const {setActiveItem} = useAppState();

  const combinedData = [
    ...results.map(item => ({type: 'result', data: item})),
    ...noteResults.map(item => ({type: 'note', data: item})),
  ];

  const renderItem = ({item}) => {
    if (item.type === 'note') {
      // Use BaseItem for notes, like NotesListComponent does
      return <BaseItem item={item.data} type={ItemTypes.NOTE} screen={false} />;
    }

    if (item.type === 'result') {
      return (
        <TouchableOpacity onPress={() => handleResultPress(item.data)}>
          <View style={styles.resultItem}>
            <Text style={styles.resultName}>
              {item.data.name || item.data.title}
            </Text>
            <Text style={styles.resultType}>{item.data.source_type}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return null;
  };

  const onFolderSelectedFromSearch = async item => {
    if (!item.parentId) {
      navigation.navigate('HomeScreen', {screen: 'Drive'});
    } else {
      const folderStack = await getFolderStackFromDB(
        item.source_type === 'folder' ? item.driveId : item.parentId,
      );
      if (folderStack.length > 0) {
        navigation.navigate('GoogleDriveViewer', {
          driveInfo: folderStack[folderStack.length - 1],
          folderStack,
        });
      } else {
        Alert.alert('Error', 'Folder hierarchy not found.');
      }
    }
  };

  const handleResultPress = async item => {
    console.log('item pressed', item);
    const typeToTab = {
      device: 'Device',
      drive: 'Drive',
      youtube: 'YouTube',
      folder: 'Drive',
      playlist: 'YouTube',
      Notebook: 'Notebooks',
    };

    const typeToMainType = {
      device: ItemTypes.DEVICE,
      drive: ItemTypes.DRIVE,
      youtube: ItemTypes.YOUTUBE,
      folder: ItemTypes.DRIVE,
      playlist: ItemTypes.YOUTUBE,
      Notebook: ItemTypes.NOTEBOOK,
    };

    setResults([]);
    setNoteResults([]);
    setShowSearch(false);

    setActiveItem({
      sourceId: getItemId(item),
      sourceType: typeToMainType[item.source_type],
      item: item,
    });

    if (item.source_type === 'youtube') {
      navigation.navigate('BacePlayer', {item});
    } else if (item.source_type === 'Notebook') {
      navigation.navigate('NotebookNotesScreen');
    } else if (item.source_type === 'playlist') {
      navigation.navigate('PlaylistView', {
        playListId: item.ytube_id,
        playListInfo: item,
      });
    } else if (item.source_type === 'device' || item.source_type === 'drive') {
      if (item.file_path && isAudioOrVideo(item.mimeType)) {
        navigation.navigate('BacePlayer', {item});
      } else {
        if (item.source_type === 'device') {
          navigation.navigate('HomeScreen', {screen: 'Device'});
        } else {
          onFolderSelectedFromSearch(item);
        }
      }
    } else if (item.source_type === 'folder') {
      onFolderSelectedFromSearch(item);
    } else {
      const targetTab = typeToTab[item.source_type];
      if (targetTab) {
        navigation.navigate('HomeScreen', {screen: targetTab});
      }
    }
  };

  if (combinedData.length === 0) {
    if (loadingSearch) {
      return (
        <View style={[styles.cardContainer, {top: headerHeight + 5}]}>
          <ActivityIndicator size={'small'} />
        </View>
      );
    }
    return null;
  }

  return (
    <View style={[styles.cardContainer, {top: headerHeight + 5}]}>
      <FlatList
        data={combinedData}
        keyExtractor={(_, index) => index.toString()}
        renderItem={renderItem}
        // style={{maxHeight: 500}}
        showsVerticalScrollIndicator={true}
      />
    </View>
  );
};

export default SearchResultsList;

const styles = StyleSheet.create({
  cardContainer: {
    position: 'absolute',
    // top: 150, // Row height (40) + margin/padding
    left: '2%',
    width: '96%',
    // margin:10,
    // width: width * 0.85,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 6,
    zIndex: 999, // Ensure it's above everything
    maxHeight: 500,
  },
  resultItem: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  resultName: {
    fontSize: 16,
    color: '#000',
  },
  resultType: {
    fontSize: 10,
    color: '#777',
  },
  noteText: {fontSize: 14, color: '#777'},
});
